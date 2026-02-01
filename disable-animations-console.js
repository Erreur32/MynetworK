// Code JavaScript à copier-coller dans la console du navigateur
// pour désactiver toutes les animations et nettoyer les anciennes références

console.log('🔧 Désactivation des animations...');

// 1. Désactiver toutes les animations dans localStorage
localStorage.setItem('mynetwork_bg_animation', 'off');
localStorage.setItem('mynetwork_full_animation_id', 'animation.80.particle-waves');

// 2. Supprimer les références aux anciennes animations supprimées
const oldAnimations = [
  'animation.99.media-background',
  'animation.95.just-in-case'
];

oldAnimations.forEach(animId => {
  // Supprimer les paramètres d'animation pour les anciennes animations
  const paramKey = `mynetwork_animation_params_${animId}`;
  if (localStorage.getItem(paramKey)) {
    localStorage.removeItem(paramKey);
    console.log(`✅ Supprimé: ${paramKey}`);
  }
});

// 3. Forcer la suppression de tous les éléments d'animation du DOM
const animatedElements = document.querySelectorAll('.animated-bg-wrapper, [class*="animation"], [class*="animate"]');
animatedElements.forEach(el => {
  if (el && el.parentNode) {
    el.remove();
    console.log('✅ Élément d\'animation supprimé du DOM');
  }
});

// 4. Désactiver les animations CSS globalement
const style = document.createElement('style');
style.id = 'disable-all-animations';
style.textContent = `
  *,
  *::before,
  *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
  }
  
  .animated-bg-wrapper,
  [class*="animation"],
  [class*="animate"] {
    display: none !important;
  }
`;
document.head.appendChild(style);

// 5. Recharger la page pour appliquer les changements
console.log('✅ Animations désactivées. Rechargement de la page dans 2 secondes...');
setTimeout(() => {
  window.location.reload();
}, 2000);
