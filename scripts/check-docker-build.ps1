# Script PowerShell pour vérifier si le build Docker est terminé après un push Git
# Usage: .\scripts\check-docker-build.ps1 [branch]
# Par défaut: main

param(
    [string]$Branch = "main"
)

$Repo = "Erreur32/MynetworK"
$Image = "ghcr.io/erreur32/mynetwork"
$Tag = "latest"

Write-Host "🔍 Vérification du build Docker pour $Repo (branche: $Branch)" -ForegroundColor Cyan
Write-Host ""

# Vérifier le dernier workflow GitHub Actions
Write-Host "📦 Vérification du workflow GitHub Actions..." -ForegroundColor Yellow

try {
    $Response = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/actions/runs?branch=$Branch&per_page=1" `
        -Headers @{Accept = "application/vnd.github.v3+json"}
    
    if ($Response.workflow_runs.Count -eq 0) {
        Write-Host "❌ Aucun workflow trouvé pour la branche $Branch" -ForegroundColor Red
        exit 1
    }
    
    $LatestRun = $Response.workflow_runs[0]
    $Status = $LatestRun.status
    $Conclusion = if ($LatestRun.conclusion) { $LatestRun.conclusion } else { "in_progress" }
    $WorkflowName = $LatestRun.name
    $CreatedAt = $LatestRun.created_at
    $HtmlUrl = $LatestRun.html_url
    
    Write-Host "  Workflow: $WorkflowName"
    Write-Host "  Créé: $CreatedAt"
    Write-Host "  Statut: $Status"
    Write-Host "  Conclusion: $Conclusion"
    Write-Host "  URL: $HtmlUrl"
    Write-Host ""
    
    if ($Status -eq "completed") {
        if ($Conclusion -eq "success") {
            Write-Host "✅ Build terminé avec succès !" -ForegroundColor Green
            Write-Host ""
            Write-Host "🐳 Vérification de l'image Docker..." -ForegroundColor Yellow
            
            # Vérifier si l'image existe dans le registry
            try {
                $ImageResponse = Invoke-WebRequest -Uri "https://ghcr.io/v2/erreur32/mynetwork/manifests/$Tag" `
                    -Method Head -UseBasicParsing -ErrorAction SilentlyContinue
                
                if ($ImageResponse.StatusCode -eq 200) {
                    Write-Host "✅ Image Docker disponible: $Image`:$Tag" -ForegroundColor Green
                    Write-Host ""
                    Write-Host "📥 Pour mettre à jour le conteneur local:" -ForegroundColor Cyan
                    Write-Host "   docker-compose pull"
                    Write-Host "   docker-compose up -d"
                    exit 0
                } else {
                    Write-Host "⚠️  Build réussi mais image pas encore disponible dans le registry" -ForegroundColor Yellow
                    Write-Host "   (peut prendre quelques minutes supplémentaires)"
                    exit 1
                }
            } catch {
                Write-Host "⚠️  Build réussi mais image pas encore disponible dans le registry" -ForegroundColor Yellow
                Write-Host "   (peut prendre quelques minutes supplémentaires)"
                exit 1
            }
        } else {
            Write-Host "❌ Build échoué: $Conclusion" -ForegroundColor Red
            Write-Host "   Consultez les logs: $HtmlUrl" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "⏳ Build en cours... (statut: $Status)" -ForegroundColor Yellow
        Write-Host "   Suivez la progression: $HtmlUrl" -ForegroundColor Cyan
        exit 2
    }
} catch {
    Write-Host "❌ Erreur lors de la vérification: $_" -ForegroundColor Red
    exit 1
}

