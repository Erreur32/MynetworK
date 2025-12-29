#!/bin/bash
# test-missing-ips.sh
# Script de diagnostic pour tester les IPs manquantes lors du scan réseau
# Usage: ./test-missing-ips.sh <container_name> [IP1] [IP2] [IP3] ...

CONTAINER_NAME=$1
if [ -z "$CONTAINER_NAME" ]; then
    echo "Usage: $0 <container_name> [IP1] [IP2] [IP3] ..."
    echo ""
    echo "Exemple:"
    echo "  $0 mynetwork 192.168.1.100 192.168.1.101 192.168.1.102"
    echo ""
    echo "Ou définir les IPs dans le script (variable IPS_MISSING)"
    exit 1
fi

# Liste des IPs manquantes (à adapter si pas passé en paramètre)
# Si des IPs sont passées en paramètre, les utiliser
shift
if [ $# -gt 0 ]; then
    IPS_MISSING="$@"
else
    # Sinon, utiliser la liste par défaut (à modifier)
    IPS_MISSING="192.168.1.100 192.168.1.101 192.168.1.102"
    echo "⚠️  Aucune IP fournie en paramètre, utilisation de la liste par défaut"
    echo "   Modifiez la variable IPS_MISSING dans le script ou passez les IPs en paramètre"
    echo ""
fi

echo "=== Test des IPs manquantes ==="
echo "Conteneur: $CONTAINER_NAME"
echo "IPs à tester: $IPS_MISSING"
echo ""

# Compteurs
TOTAL=0
PING_OK_3S=0
PING_OK_5S=0
PING_OK_10S=0
PING_FAILED=0
IN_ARP=0
IN_HOST_ARP=0

for ip in $IPS_MISSING; do
    TOTAL=$((TOTAL + 1))
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Testing $ip ($TOTAL/${#IPS_MISSING[@]})..."
    echo ""
    
    PING_SUCCESS=false
    
    # Test 1: Ping standard (3s timeout)
    echo -n "  [1] Ping 3s timeout: "
    if docker exec $CONTAINER_NAME ping -c 1 -W 3 $ip > /dev/null 2>&1; then
        echo "✅ OK"
        PING_OK_3S=$((PING_OK_3S + 1))
        PING_SUCCESS=true
    else
        echo "❌ FAILED"
        
        # Test 2: Ping avec timeout plus long (5s)
        echo -n "  [2] Ping 5s timeout: "
        if docker exec $CONTAINER_NAME ping -c 1 -W 5 $ip > /dev/null 2>&1; then
            echo "⚠️  OK (latence élevée)"
            PING_OK_5S=$((PING_OK_5S + 1))
            PING_SUCCESS=true
        else
            echo "❌ FAILED"
            
            # Test 3: Ping avec timeout très long (10s)
            echo -n "  [3] Ping 10s timeout: "
            if docker exec $CONTAINER_NAME ping -c 1 -W 10 $ip > /dev/null 2>&1; then
                echo "⚠️  OK (latence très élevée)"
                PING_OK_10S=$((PING_OK_10S + 1))
                PING_SUCCESS=true
            else
                echo "❌ FAILED"
                PING_FAILED=$((PING_FAILED + 1))
            fi
        fi
    fi
    
    # Test 4: Vérifier dans ARP (ip neigh)
    echo -n "  [4] Présence dans ARP (ip neigh): "
    ARP_RESULT=$(docker exec $CONTAINER_NAME ip neigh show 2>/dev/null | grep "$ip" | head -1)
    if [ -n "$ARP_RESULT" ]; then
        MAC=$(echo "$ARP_RESULT" | awk '{print $5}')
        STATE=$(echo "$ARP_RESULT" | awk '{print $6}')
        echo "✅ OUI (MAC: $MAC, State: $STATE)"
        IN_ARP=$((IN_ARP + 1))
    else
        echo "❌ NON"
    fi
    
    # Test 5: Vérifier dans /host/proc/net/arp (si monté)
    echo -n "  [5] Présence dans /host/proc/net/arp: "
    if docker exec $CONTAINER_NAME test -r /host/proc/net/arp 2>/dev/null; then
        HOST_ARP_RESULT=$(docker exec $CONTAINER_NAME cat /host/proc/net/arp 2>/dev/null | grep "^$ip ")
        if [ -n "$HOST_ARP_RESULT" ]; then
            MAC=$(echo "$HOST_ARP_RESULT" | awk '{print $4}')
            FLAGS=$(echo "$HOST_ARP_RESULT" | awk '{print $3}')
            echo "✅ OUI (MAC: $MAC, Flags: $FLAGS)"
            IN_HOST_ARP=$((IN_HOST_ARP + 1))
        else
            echo "❌ NON"
        fi
    else
        echo "⚠️  Volume /host/proc non monté ou non accessible"
    fi
    
    # Test 6: Mesurer la latence si ping OK
    if [ "$PING_SUCCESS" = true ]; then
        echo -n "  [6] Latence mesurée: "
        LATENCY=$(docker exec $CONTAINER_NAME ping -c 3 -W 3 $ip 2>/dev/null | grep "time=" | awk -F'time=' '{print $2}' | awk '{print $1}' | awk '{sum+=$1; count++} END {if(count>0) printf "%.1f", sum/count; else print "N/A"}')
        if [ -n "$LATENCY" ] && [ "$LATENCY" != "N/A" ]; then
            echo "${LATENCY}ms"
        else
            echo "N/A"
        fi
    fi
    
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "=== Résumé ==="
echo "Total IPs testées: $TOTAL"
echo ""
echo "Résultats ping:"
echo "  ✅ Ping OK (3s): $PING_OK_3S"
echo "  ⚠️  Ping OK (5s): $PING_OK_5S"
echo "  ⚠️  Ping OK (10s): $PING_OK_10S"
echo "  ❌ Ping FAILED: $PING_FAILED"
echo ""
echo "Présence dans ARP:"
echo "  ✅ Dans ip neigh: $IN_ARP"
echo "  ✅ Dans /host/proc/net/arp: $IN_HOST_ARP"
echo ""
echo "=== Fin des tests ==="

# Suggestions basées sur les résultats
echo ""
echo "=== Suggestions ==="
if [ $PING_OK_5S -gt 0 ] || [ $PING_OK_10S -gt 0 ]; then
    echo "⚠️  Certaines IPs répondent avec latence élevée (>3s)"
    echo "   → Solution: Augmenter PING_TIMEOUT à 5s pour Docker/VM"
fi

if [ $PING_FAILED -gt 0 ] && [ $IN_ARP -gt 0 ]; then
    echo "⚠️  Certaines IPs ne répondent pas au ping mais sont dans ARP"
    echo "   → Ces appareils bloquent probablement ICMP"
    echo "   → Solution: Utiliser la table ARP comme source principale"
fi

if [ $PING_FAILED -eq $TOTAL ]; then
    echo "❌ Aucune IP ne répond au ping"
    echo "   → Vérifier la configuration réseau Docker"
    echo "   → Vérifier les capacités NET_RAW et NET_ADMIN"
fi

