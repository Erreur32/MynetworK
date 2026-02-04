/**
 * Animated background layer: CSS variants (gradient, particles, grid)
 * and full-animation variants (lovelace-style IDs mapped to CSS/Canvas).
 * Renders nothing when variant is 'off' or when prefers-reduced-motion.
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import type { EffectiveVariant } from '../hooks/useBackgroundAnimation';
import type { AnimationSpeed } from '../hooks/useBackgroundAnimation';
import { speedToMultiplier } from '../hooks/useBackgroundAnimation';
import type { AnimationParameters } from '../hooks/useAnimationParameters';

interface AnimatedBackgroundProps {
  variant: EffectiveVariant;
  /** When true, do not render animation (e.g. prefers-reduced-motion) */
  disabled?: boolean;
  /** Speed: slow (default), normal, fast */
  animationSpeed?: AnimationSpeed;
  /** Animation-specific parameters */
  animationParameters?: AnimationParameters;
}

/** Map full-animation IDs to internal visual key (CSS class / canvas) */
const FULL_ID_TO_VISUAL: Record<string, string> = {
  'animation.1.home-assistant-particles': 'home-assistant-particles', // Réseau de particules connectées
  'animation.10.css-dark-particles': 'css-dark-particles', // CSS Dark Particles avec 200 particules animées
  'animation.72.playstation-3-bg-style': 'playstation',
  'animation.79.canvas-ribbons': 'canvas-ribbons', // Canvas Ribbons avec courbes de Bézier
  'animation.80.particle-waves': 'particle-waves', // WebGL-style particle waves (Canvas)
  'animation.90.aurora': 'aurora', // Icelandic Aurora (version originale optimisée)
  'animation.92.aurora-v2': 'aurora-v2', // Icelandic Aurora v2 avec Canvas 2D
  'animation.93.particules-line': 'particules-line', // Copie de particle-waves
  'animation.94.alien-blackout': 'alien-blackout', // Alien Blackout Intro Scene - Étoiles animées
  'animation.95.bit-ocean': 'bit-ocean', // Bit Ocean - grille de points (Griffin Moyer / Codepen)
  'animation.96.stars': 'stars', // Stars - Étoiles en orbite avec scintillement
  'animation.97.space': 'space', // Space - Effet de tunnel spatial 3D
  'animation.98.sidelined': 'sidelined', // Sidelined - Lignes diagonales animées
};

function getVisualKey(variant: EffectiveVariant): string | null {
  if (variant === 'off') return null;
  // Les variants bgAnimation sont maintenant des FullAnimationId
  return FULL_ID_TO_VISUAL[variant] ?? null;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  variant,
  disabled,
  animationSpeed = 0.75,
  animationParameters = {} as AnimationParameters,
}) => {
  const visual = getVisualKey(variant);
  if (disabled || !visual) return null;

  // Convert slider value (0-1.5) to animation multiplier (0.3-3.0)
  const speedMultiplier = speedToMultiplier(animationSpeed);

  // Les variants bgAnimation sont maintenant directement des FullAnimationId
  // Le mapping se fait via getVisualKey qui utilise FULL_ID_TO_VISUAL

  // Home Assistant Particles (animation.1.home-assistant-particles) - réseau de particules connectées
  if (visual === 'home-assistant-particles') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <HomeAssistantParticlesCanvas 
          animationSpeed={animationSpeed}
          particleCount={animationParameters?.particleCount as number | undefined}
          connectionDistance={animationParameters?.connectionDistance as number | undefined}
          particleColor={animationParameters?.particleColor as string | undefined}
        />
      </div>
    );
  }

  // Particle Waves (animation.80.particle-waves) - WebGL-style shader-like canvas
  if (visual === 'particle-waves') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <ParticleWavesCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          particleSize={animationParameters?.particleSize as number | undefined}
          waveHeight={animationParameters?.waveHeight as number | undefined}
        />
      </div>
    );
  }

  // Particules Line (animation.93.particules-line) - copie de particle-waves
  if (visual === 'particules-line') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <ParticulesLineCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          particleSize={animationParameters?.particleSize as number | undefined}
        />
      </div>
    );
  }

  // Playstation 3 - RetroArch Menu Ribbon (animation.72.playstation-3-bg-style)
  if (visual === 'playstation') {
    return (
      <div
        className="fixed inset-0 -z-10 animated-bg-wrapper"
        aria-hidden
        style={{ 
          background: 'var(--bg-primary, #0a0a0f)',
          ['--animation-speed' as string]: speedMultiplier,
          ['--wave-color' as string]: animationParameters?.waveColor || 'rgb(31, 29, 139)'
        }}
      >
        <PlaystationCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          waveColor={(animationParameters?.waveColor as string) || 'rgb(31, 29, 139)'}
          targetFPS={animationParameters?.targetFPS as number | undefined}
          animationTimeout={animationParameters?.animationTimeout as number | undefined}
          enableAnimationTimeout={animationParameters?.enableAnimationTimeout as boolean | undefined}
        />
      </div>
    );
  }

  // CSS Dark Particles (animation.10.css-dark-particles) - 200 particules CSS animées
  if (visual === 'css-dark-particles') {
    // CSS: duration * --animation-speed → plus la var est grande, plus c'est lent. Param speed 0.05=lent, 2.0=rapide.
    // Donc --animation-speed = 1/param pour que param 2.0 → var 0.5 (rapide), param 0.05 → var 20 (très lent)
    const customSpeed = animationParameters?.speed as number | undefined;
    const cssSpeedVar = customSpeed !== undefined
      ? 1 / Math.max(0.05, Math.min(2.0, customSpeed))
      : 1 / speedMultiplier;
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: cssSpeedVar }}
      >
        <CssDarkParticles 
          animationSpeed={animationSpeed}
          speed={customSpeed}
          particleCount={animationParameters?.particleCount as number | undefined}
        />
      </div>
    );
  }

  // Canvas Ribbons (animation.79.canvas-ribbons) - Rubans animés avec courbes de Bézier
  if (visual === 'canvas-ribbons') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <CanvasRibbons 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          wavesCount={animationParameters?.wavesCount as number | undefined}
          ribbonWidth={animationParameters?.ribbonWidth as number | undefined}
          amplitude={animationParameters?.amplitude as number | undefined}
          rotation={animationParameters?.rotation as number | undefined}
        />
      </div>
    );
  }

  // Aurora (animation.90.aurora) - Icelandic Aurora (lovelace-bg-animation v1)
  if (visual === 'aurora') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <AuroraCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          blurIntensity={animationParameters?.blurIntensity as number | undefined}
          colorIntensity={animationParameters?.colorIntensity as number | undefined}
          streakCount={animationParameters?.streakCount as number | undefined}
          targetFPS={animationParameters?.targetFPS as number | undefined}
          animationTimeout={animationParameters?.animationTimeout as number | undefined}
          enableAnimationTimeout={animationParameters?.enableAnimationTimeout as boolean | undefined}
        />
      </div>
    );
  }

  // Aurora v2 (animation.92.aurora-v2) - Icelandic Aurora v2
  if (visual === 'aurora-v2') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <AuroraV2Canvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          blurIntensity={animationParameters?.blurIntensity as number | undefined}
          colorIntensity={animationParameters?.colorIntensity as number | undefined}
          streakCount={animationParameters?.streakCount as number | undefined}
          targetFPS={animationParameters?.targetFPS as number | undefined}
          animationTimeout={animationParameters?.animationTimeout as number | undefined}
          enableAnimationTimeout={animationParameters?.enableAnimationTimeout as boolean | undefined}
        />
      </div>
    );
  }

  // Bit Ocean (animation.95.bit-ocean) - grille de points animée par bruit (Griffin Moyer / Codepen)
  if (visual === 'bit-ocean') {
    return (
      <div
        className="fixed inset-0 -z-10 animated-bg-wrapper"
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <BitOceanCanvas
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          pointSize={animationParameters?.pointSize as number | undefined}
        />
      </div>
    );
  }

  // Alien Blackout (animation.94.alien-blackout) - Alien: Blackout Intro Scene (React + WebGL style)
  if (visual === 'alien-blackout') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <AlienBlackoutCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          starCount={animationParameters?.starCount as number | undefined}
          starSize={animationParameters?.starSize as number | undefined}
          targetFPS={animationParameters?.targetFPS as number | undefined}
          animationTimeout={animationParameters?.animationTimeout as number | undefined}
          enableAnimationTimeout={animationParameters?.enableAnimationTimeout as boolean | undefined}
        />
      </div>
    );
  }

  // Stars (animation.96.stars) - Étoiles en orbite avec scintillement
  if (visual === 'stars') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <StarsCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          starCount={animationParameters?.starCount as number | undefined}
          hue={animationParameters?.hue as number | undefined}
        />
      </div>
    );
  }

  // Space (animation.97.space) - Effet de tunnel spatial 3D
  if (visual === 'space') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <SpaceCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          particleCount={animationParameters?.particleCount as number | undefined}
          particleSize={animationParameters?.particleSize as number | undefined}
          defaultSpeed={animationParameters?.defaultSpeed as number | undefined}
          boostSpeed={animationParameters?.boostSpeed as number | undefined}
        />
      </div>
    );
  }

  // Sidelined (animation.98.sidelined) - Lignes diagonales animées
  if (visual === 'sidelined') {
    return (
      <div 
        className="fixed inset-0 -z-10 animated-bg-wrapper" 
        aria-hidden
        style={{ ['--animation-speed' as string]: speedMultiplier }}
      >
        <SidelinedCanvas 
          animationSpeed={animationSpeed}
          speed={animationParameters?.speed as number | undefined}
          lineCount={animationParameters?.lineCount as number | undefined}
          hue={animationParameters?.hue as number | undefined}
        />
      </div>
    );
  }

  // Full-animation CSS variants: two layers so theme doesn't override background-image
  // (full-animation theme sets .bg-theme-primary { background: transparent !important } which would wipe animation)
  const fullClass = `${visual}-bg-animate`;
  return (
    <div
      className="fixed inset-0 -z-10 animated-bg-wrapper"
      aria-hidden
      style={{ 
        background: 'var(--bg-primary, #0a0a0f)',
        ['--animation-speed' as string]: speedMultiplier
      }}
    >
      <div className={`absolute inset-0 ${fullClass}`} />
    </div>
  );
};

const ParticlesCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const count = 60;
    const particles: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        r: Math.random() * 1.5 + 0.5,
      });
    }

    const tick = () => {
      ctx.fillStyle = 'rgb(15, 15, 15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.fill();
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: 'var(--color-bg-primary, #0f0f0f)' }}
    />
  );
};

/** Home Assistant Particles (animation.1.home-assistant-particles) - réseau de particules avec connexions */
const HomeAssistantParticlesCanvas: React.FC<{ 
  animationSpeed?: AnimationSpeed;
  particleCount?: number;
  connectionDistance?: number;
  particleColor?: string;
}> = ({ 
  animationSpeed = 0.75,
  particleCount = 50,
  connectionDistance = 150,
  particleColor = '#009ac7'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const speedMult = speedToMultiplier(animationSpeed); // Convert slider value to multiplier

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove);

    const linkDistance = connectionDistance;
    const mouseDistance = connectionDistance;
    const particleSpeed = 0.5;
    const particleSize = 2;
    const linkOpacity = 0.7;

    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
    }[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * particleSpeed,
        vy: (Math.random() - 0.5) * particleSpeed,
      });
    }

    const tick = () => {
      // Clear fully with background color (opacity 1) to avoid visible trails
      ctx.fillStyle = 'rgb(17, 17, 17)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mouse = mouseRef.current;
      const minSpeed = 0.05; // Vitesse minimale pour éviter le gel
      const friction = 0.995; // Réduit la friction pour maintenir le mouvement

      particles.forEach((p) => {
        // Appliquer la vitesse avec le multiplicateur
        p.x += p.vx * speedMult;
        p.y += p.vy * speedMult;

        // Rebondir et maintenir dans les limites
        if (p.x < 0) {
          p.x = 0;
          p.vx = Math.abs(p.vx) || particleSpeed * 0.3;
        } else if (p.x > canvas.width) {
          p.x = canvas.width;
          p.vx = -Math.abs(p.vx) || -particleSpeed * 0.3;
        }
        if (p.y < 0) {
          p.y = 0;
          p.vy = Math.abs(p.vy) || particleSpeed * 0.3;
        } else if (p.y > canvas.height) {
          p.y = canvas.height;
          p.vy = -Math.abs(p.vy) || -particleSpeed * 0.3;
        }

        // Interaction avec la souris
        const dx = mouse.x - p.x;
        const dy = mouse.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < mouseDistance && dist > 0) {
          const force = (mouseDistance - dist) / mouseDistance;
          p.vx -= (dx / dist) * force * 0.02;
          p.vy -= (dy / dist) * force * 0.02;
        }

        // Appliquer friction mais maintenir une vitesse minimale
        p.vx *= friction;
        p.vy *= friction;
        
        // S'assurer que la vitesse ne devient pas trop petite
        const speed = Math.hypot(p.vx, p.vy);
        if (speed < minSpeed && speed > 0) {
          const ratio = minSpeed / speed;
          p.vx *= ratio;
          p.vy *= ratio;
        } else if (speed === 0) {
          // Réinitialiser si complètement arrêtée
          p.vx = (Math.random() - 0.5) * particleSpeed;
          p.vy = (Math.random() - 0.5) * particleSpeed;
        }
      });

      ctx.strokeStyle = particleColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.hypot(dx, dy);
          if (d < linkDistance) {
            ctx.globalAlpha = linkOpacity * (1 - d / linkDistance);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
        ctx.fillStyle = particleColor;
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [speedMult, particleCount, connectionDistance, particleColor]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: 'linear-gradient(135deg, #111111 0%, #1c1c1c 100%)' }}
    />
  );
};

/** Particle Waves (animation.80.particle-waves) - Reproduction exacte du WebGL shader original (package.yaml) */
const ParticleWavesCanvas: React.FC<{ 
  animationSpeed?: AnimationSpeed;
  speed?: number;
  particleSize?: number;
  waveHeight?: number;
}> = ({ 
  animationSpeed = 0.75,
  speed: customSpeed,
  particleSize = 1.2,
  waveHeight = 3
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Paramètres exacts selon package.yaml (avec paramètres configurables)
    const pointSize = particleSize;
    const distance = 5;
    const height = waveHeight;
    const speed = 5;
    
    let particles: { x3d: number; y3d: number; z3d: number; color: [number, number, number, number] }[] = [];
    let fieldX = 0;
    let fieldZ = 0;
    
    const initParticles = () => {
      particles = [];
      const w = canvas.width || window.innerWidth;
      const h = canvas.height || window.innerHeight;
      const width = 400 * (w / h);
      const depth = 400;
      
      fieldX = width;
      fieldZ = depth;
      
      // Grille 3D exacte selon package.yaml
      for (let x = 0; x < width; x += distance) {
        for (let z = 0; z < depth; z += distance) {
          particles.push({
            x3d: -width / 2 + x,
            y3d: -30,
            z3d: -depth / 2 + z,
            // Couleurs exactes : [0, 1 - (x/width)*1, 0.5 + (x/width)*0.5, z/depth]
            color: [
              0,
              1 - (x / width) * 1,
              0.5 + (x / width) * 0.5,
              z / depth,
            ],
          });
        }
      }
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };
    resize();
    window.addEventListener('resize', resize);

    // Projection 3D WebGL - simulation Canvas 2D
    // Caméra à z=100, regarde vers -z (z négatif = loin)
    const project3D = (x: number, y: number, z: number, w: number, h: number): { x: number; y: number; w: number } | null => {
      const fov = 60;
      const cameraZ = 100;
      const aspect = w / h;
      
      // Distance à la caméra
      // z va de -200 à +200 (depth=400, donc -200 à +200)
      // zView = distance de la caméra (z=100) au point
      const zView = cameraZ - z;
      
      // Éviter les valeurs invalides - retourner null pour filtrer ces particules
      if (zView <= 1) {
        return null;
      }
      
      // Projection perspective (FOV 60 degrés)
      const fovRad = fov * (Math.PI / 180);
      const f = 1.0 / Math.tan(fovRad / 2);
      
      // Projection perspective standard
      // Dans WebGL, après projection : x' = (x * f / aspect) / zView
      const xProj = (x * f) / (zView * aspect);
      const yProj = (y * f) / zView;
      
      // Convertir de NDC (-1 à 1) vers coordonnées écran
      // WebGL : x écran = (xProj + 1) * (width / 2)
      return {
        x: (xProj + 1) * (w / 2),
        y: (1 - yProj) * (h / 2), // Inverser Y pour Canvas (Y vers le bas)
        w: zView, // gl_Position.w pour pointSize
      };
    };

    const tick = (now: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = now;
      }
      
      // Temps exact comme l'original : elapsed = (now - start) / 5000
      const elapsed = ((now - startTimeRef.current) / 5000) * speedMult;
      const w = canvas.width;
      const h = canvas.height;
      const dpi = window.devicePixelRatio || 1;

      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, w, h);

      // Calculer les positions 3D avec vagues (formule exacte du shader)
      const M_PI = Math.PI;
      
      const projected: { x: number; y: number; w: number; color: [number, number, number, number]; z3d: number }[] = particles.map((p) => {
        // Formule exacte : pos.y += (cos(pos.x / u_field.x * M_PI * 8.0 + u_time * u_speed) + sin(pos.z / u_field.z * M_PI * 8.0 + u_time * u_speed)) * u_field.y
        const waveY = (
          Math.cos((p.x3d / fieldX) * M_PI * 8.0 + elapsed * speed) +
          Math.sin((p.z3d / fieldZ) * M_PI * 8.0 + elapsed * speed)
        ) * height;
        
        const y3d = p.y3d + waveY;
        const proj = project3D(p.x3d, y3d, p.z3d, w, h);
        
        // Filtrer les particules trop proches de la caméra (proj === null)
        if (!proj) {
          return null;
        }
        
        return {
          x: proj.x,
          y: proj.y,
          w: proj.w,
          color: p.color,
          z3d: p.z3d,
        };
      }).filter((p): p is { x: number; y: number; w: number; color: [number, number, number, number]; z3d: number } => p !== null);

      // Trier par profondeur (z) pour dessiner les plus lointaines en premier
      projected.sort((a, b) => b.z3d - a.z3d);

      // Dessiner les particules avec pointSize exact : (u_size / gl_Position.w) * 100.0
      // où u_size = (h / 400) * pointSize * dpi
      const baseSize = (h / 400) * pointSize * dpi;
      
      // Mode blend additif simulé (SRC_ALPHA, ONE)
      ctx.globalCompositeOperation = 'screen';
      
      projected.forEach((p) => {
        // Vérifier que la particule est visible et que w est valide
        if (p.w <= 0 || p.w > 1000) return;
        if (p.x < -200 || p.x > w + 200 || p.y < -200 || p.y > h + 200) return;
        
        // PointSize exact : (u_size / gl_Position.w) * 100.0
        // Limiter la taille pour des points plus fins
        const size = Math.min(5, Math.max(0.3, (baseSize / p.w) * 100.0));
        const [r, g, b, a] = p.color;
        
        // Alpha selon profondeur (plus loin = plus transparent)
        const alpha = a * (1 - Math.min(1, p.w / 500));
        
        // Particule avec couleur selon position (vert→bleu)
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${alpha * 0.8})`;
        ctx.fill();
      });
      
      ctx.globalCompositeOperation = 'source-over';

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      startTimeRef.current = null;
    };
  }, [speedMult, particleSize, waveHeight]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

/** Particules Line (animation.93.particules-line) - copie de Particle Waves */
const ParticulesLineCanvas: React.FC<{ 
  animationSpeed?: AnimationSpeed;
  speed?: number;
  particleSize?: number;
}> = ({ 
  animationSpeed = 0.75,
  speed: customSpeed,
  particleSize = 1.2
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const speedMult = speedToMultiplier(animationSpeed);
  const paramMultiplier = customSpeed !== undefined ? Math.max(0.1, Math.min(2.0, customSpeed)) : 1;
  const effectiveSpeed = speedMult * paramMultiplier;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const cols = 16;
    const rows = 12;
    const particles: { u: number; v: number; phase: number; amp: number; freq: number }[] = [];
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        particles.push({
          u: (i + 0.5) / cols,
          v: (j + 0.5) / rows,
          phase: Math.random() * Math.PI * 2,
          amp: 0.015 + Math.random() * 0.02,
          freq: 0.008 + Math.random() * 0.01,
        });
      }
    }

    const tick = () => {
      timeRef.current += 0.016 * effectiveSpeed;
      const t = timeRef.current;
      const w = canvas.width;
      const h = canvas.height;
      const linkDist = Math.min(w, h) * 0.11;

      // Clear fully with background color (opacity 1) to avoid visible trails
      ctx.fillStyle = 'rgb(10, 10, 18)';
      ctx.fillRect(0, 0, w, h);

      const positions: { x: number; y: number }[] = particles.map((p) => ({
        x: p.u * w + Math.sin(t * 0.8 + p.phase) * p.amp * w,
        y: p.v * h + Math.sin(t * 0.6 + p.u * w * p.freq + p.phase) * p.amp * h,
      }));

      // Draw links between nearby particles (wave mesh)
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const d = Math.hypot(dx, dy);
          if (d < linkDist) {
            ctx.globalAlpha = 1 - d / linkDist;
            ctx.beginPath();
            ctx.moveTo(positions[i].x, positions[i].y);
            ctx.lineTo(positions[j].x, positions[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      // Draw particles (glow-like dots)
      positions.forEach((pos, i) => {
        const p = particles[i];
        const pulse = 0.7 + 0.3 * Math.sin(t * 1.2 + p.phase);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, particleSize * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, particleSize * 2.1 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [effectiveSpeed, particleSize]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: 'var(--bg-primary, #0a0a12)' }}
    />
  );
};

/** Playstation 3 - RetroArch Menu Ribbon (animation.72.playstation-3-bg-style), port Canvas 2D */
const PlaystationCanvas: React.FC<{ 
  animationSpeed?: AnimationSpeed;
  speed?: number;
  waveColor?: string;
  targetFPS?: number;
  animationTimeout?: number;
  enableAnimationTimeout?: boolean;
}> = ({ 
  animationSpeed = 0.75,
  speed: customSpeed,
  waveColor = 'rgb(31, 29, 139)',
  targetFPS: customTargetFPS = 60,
  animationTimeout: timeoutMs = 5000,
  enableAnimationTimeout = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const animationStartTimeRef = useRef<number>(0);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed * 5.0;
  const targetFPS = Math.max(10, Math.min(100, customTargetFPS));
  const frameInterval = 1000 / targetFPS;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: false });
    if (!ctx) return;

    // Activer l'anti-aliasing pour un rendu plus lisse
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      // Augmenter la résolution pour éliminer les pixels
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      
      // Réinitialiser la transformation et mettre à l'échelle pour la haute résolution
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      // Réactiver l'anti-aliasing après resize
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };
    resize();
    window.addEventListener('resize', resize);

    // Parser la couleur RGB ou hex
    const parseColor = (colorStr: string): { r: number; g: number; b: number } => {
      // Format RGB
      const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (rgbMatch) {
        return {
          r: parseInt(rgbMatch[1], 10),
          g: parseInt(rgbMatch[2], 10),
          b: parseInt(rgbMatch[3], 10),
        };
      }
      // Format hex
      const hexMatch = colorStr.match(/#([0-9a-fA-F]{6})/);
      if (hexMatch) {
        return {
          r: parseInt(hexMatch[1].slice(0, 2), 16),
          g: parseInt(hexMatch[1].slice(2, 4), 16),
          b: parseInt(hexMatch[1].slice(4, 6), 16),
        };
      }
      // Fallback blanc
      return { r: 255, g: 255, b: 255 };
    };

    const color = parseColor(waveColor);
    
    // Simulation du shader WebGL avec Canvas 2D
    // Grille de points pour simuler le PlaneGeometry(1, 1, 128, 128)
    const gridRes = 128; // Résolution de la grille comme dans l'original (128x128)
    const points: { x: number; y: number; z: number; worldX: number; worldY: number; worldZ: number }[][] = [];
    
    // Initialiser la grille de points
    for (let i = 0; i <= gridRes; i++) {
      points[i] = [];
      for (let j = 0; j <= gridRes; j++) {
        points[i][j] = { x: 0, y: 0, z: 0, worldX: 0, worldY: 0, worldZ: 0 };
      }
    }
    
    // Paramètres de caméra (comme Three.js PerspectiveCamera)
    const cameraZ = 2.0; // Position de la caméra comme dans l'original
    const fov = 75; // Field of view en degrés

    // Fonctions de bruit (simulation des fonctions du shader)
    const iqhash = (n: number): number => {
      return ((Math.sin(n) * 43758.5453) % 1 + 1) % 1;
    };

    const noise = (x: number, y: number, z: number): number => {
      const p = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
      const f = { x: x - p.x, y: y - p.y, z: z - p.z };
      const f2 = { x: f.x * f.x * (3 - 2 * f.x), y: f.y * f.y * (3 - 2 * f.y), z: f.z * f.z * (3 - 2 * f.z) };
      const n = p.x + p.y * 57 + 113 * p.z;
      
      return (
        (1 - f2.z) * (
          (1 - f2.y) * (
            (1 - f2.x) * iqhash(n) + f2.x * iqhash(n + 1)
          ) + f2.y * (
            (1 - f2.x) * iqhash(n + 57) + f2.x * iqhash(n + 58)
          )
        ) + f2.z * (
          (1 - f2.y) * (
            (1 - f2.x) * iqhash(n + 113) + f2.x * iqhash(n + 114)
          ) + f2.y * (
            (1 - f2.x) * iqhash(n + 170) + f2.x * iqhash(n + 171)
          )
        )
      );
    };

    const xmb_noise2 = (x: number, z: number, t: number): number => {
      return Math.cos(z * 4) * Math.cos(z + t / 10 + x);
    };

    const doFrame = () => {
      const t = timeRef.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const centerX = w / 2;
      const centerY = h / 2;
      const aspect = w / h;
      const scaleX = aspect * 1.55;
      const scaleY = 0.75;
      const baseScale = Math.min(w, h);

      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, w, h);

      // Calculer les positions 3D des points (simulation exacte du vertex shader)
      for (let i = 0; i <= gridRes; i++) {
        for (let j = 0; j <= gridRes; j++) {
          const u = (i / gridRes - 0.5) * 2;
          const v = (j / gridRes - 0.5) * 2;
          
          // Simulation exacte du vertex shader
          // vec3 v = vec3(pos.x, 0.0, pos.y);
          let x = u;
          let y = 0.0;
          let z = v;
          
          // vec3 v2 = v;
          const v2x = x;
          const v2z = z;
          
          // v.y = xmb_noise2(v2) / 8.0;
          y = xmb_noise2(v2x, v2z, t) / 8.0;
          
          // vec3 v3 = v;
          let v3x = x;
          let v3y = y;
          let v3z = z;
          
          // v3.x -= time / 5.0;
          // v3.x /= 4.0;
          v3x = (v3x - t / 5.0) / 4.0;
          
          // v3.z -= time / 10.0;
          v3z = v3z - t / 10.0;
          
          // v3.y -= time / 100.0;
          v3y = v3y - t / 100.0;
          
          // v.z -= noise(v3 * 7.0) / 15.0;
          // v.y -= noise(v3 * 7.0) / 15.0 + cos(v.x * 2.0 - time / 2.0) / 5.0 - 0.3;
          const n = noise(v3x * 7.0, v3y * 7.0, v3z * 7.0);
          z -= n / 15.0;
          y -= n / 15.0 + Math.cos(x * 2.0 - t / 2.0) / 5.0 - 0.3;
          
          // Stocker les coordonnées 3D du monde
          points[i][j].worldX = x;
          points[i][j].worldY = y;
          points[i][j].worldZ = z;
          
          // Projection perspective (comme Three.js PerspectiveCamera)
          // Projection standard : x' = (x * f) / (zView * aspect), y' = (y * f) / zView
          const zView = cameraZ - z; // Distance de la caméra au point
          if (zView <= 0.1) {
            // Point derrière la caméra ou trop proche
            points[i][j].x = centerX;
            points[i][j].y = centerY;
            points[i][j].z = z;
            continue;
          }
          
          const fovRad = fov * (Math.PI / 180);
          const f = 1.0 / Math.tan(fovRad / 2);
          
          // Projection perspective
          const xProj = (x * f) / (zView * aspect);
          const yProj = (y * f) / zView;
          
          // Convertir de NDC (-1 à 1) vers coordonnées écran
          const projX = centerX + xProj * baseScale * scaleX;
          const projY = centerY - yProj * baseScale * scaleY; // Inverser Y pour Canvas
          
          points[i][j].x = projX;
          points[i][j].y = projY;
          points[i][j].z = z;
        }
      }

      // Dessiner les triangles (simulation exacte du fragment shader avec normal)
      ctx.globalCompositeOperation = 'screen';
      
      // Vecteur up pour le calcul de l'éclairage (comme dans le shader)
      const up = { x: 0, y: 0, z: 1 };
      
      for (let i = 0; i < gridRes; i++) {
        for (let j = 0; j < gridRes; j++) {
          const p1 = points[i][j];
          const p2 = points[i + 1][j];
          const p3 = points[i][j + 1];
          const p4 = points[i + 1][j + 1];
          
          // Calculer la normale en 3D (simulation de dFdx/dFdy du fragment shader)
          // Utiliser les coordonnées 3D du monde pour un calcul plus précis
          const v1 = {
            x: p2.worldX - p1.worldX,
            y: p2.worldY - p1.worldY,
            z: p2.worldZ - p1.worldZ
          };
          const v2 = {
            x: p3.worldX - p1.worldX,
            y: p3.worldY - p1.worldY,
            z: p3.worldZ - p1.worldZ
          };
          
          // Produit vectoriel pour obtenir la normale
          const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
          };
          
          // Normaliser la normale
          const len = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
          if (len > 0.0001) {
            normal.x /= len;
            normal.y /= len;
            normal.z /= len;
          }
          
          // Calculer l'éclairage (comme dans le fragment shader)
          // c = 1.0 - dot(normal, up)
          const dotProduct = normal.x * up.x + normal.y * up.y + normal.z * up.z;
          let c = 1.0 - dotProduct;
          // c = (1.0 - cos(c * c)) / 3.0
          c = (1.0 - Math.cos(c * c)) / 3.0;
          const alpha = c * 1.5;
          
          if (alpha > 0.01) {
            const finalAlpha = Math.min(alpha, 1.0);
            
            // Calculer l'alpha pour chaque triangle séparément pour plus de précision
            // Triangle 1
            const v1_t1 = {
              x: p2.worldX - p1.worldX,
              y: p2.worldY - p1.worldY,
              z: p2.worldZ - p1.worldZ
            };
            const v2_t1 = {
              x: p3.worldX - p1.worldX,
              y: p3.worldY - p1.worldY,
              z: p3.worldZ - p1.worldZ
            };
            const normal_t1 = {
              x: v1_t1.y * v2_t1.z - v1_t1.z * v2_t1.y,
              y: v1_t1.z * v2_t1.x - v1_t1.x * v2_t1.z,
              z: v1_t1.x * v2_t1.y - v1_t1.y * v2_t1.x
            };
            const len_t1 = Math.sqrt(normal_t1.x * normal_t1.x + normal_t1.y * normal_t1.y + normal_t1.z * normal_t1.z);
            if (len_t1 > 0.0001) {
              normal_t1.x /= len_t1;
              normal_t1.y /= len_t1;
              normal_t1.z /= len_t1;
            }
            const dot_t1 = normal_t1.x * up.x + normal_t1.y * up.y + normal_t1.z * up.z;
            let c_t1 = 1.0 - dot_t1;
            c_t1 = (1.0 - Math.cos(c_t1 * c_t1)) / 3.0;
            const alpha_t1 = Math.min(c_t1 * 1.5, 1.0);
            
            if (alpha_t1 > 0.01) {
              ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha_t1})`;
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.lineTo(p3.x, p3.y);
              ctx.closePath();
              ctx.fill();
            }
            
            // Triangle 2
            const v1_t2 = {
              x: p4.worldX - p2.worldX,
              y: p4.worldY - p2.worldY,
              z: p4.worldZ - p2.worldZ
            };
            const v2_t2 = {
              x: p3.worldX - p2.worldX,
              y: p3.worldY - p2.worldY,
              z: p3.worldZ - p2.worldZ
            };
            const normal_t2 = {
              x: v1_t2.y * v2_t2.z - v1_t2.z * v2_t2.y,
              y: v1_t2.z * v2_t2.x - v1_t2.x * v2_t2.z,
              z: v1_t2.x * v2_t2.y - v1_t2.y * v2_t2.x
            };
            const len_t2 = Math.sqrt(normal_t2.x * normal_t2.x + normal_t2.y * normal_t2.y + normal_t2.z * normal_t2.z);
            if (len_t2 > 0.0001) {
              normal_t2.x /= len_t2;
              normal_t2.y /= len_t2;
              normal_t2.z /= len_t2;
            }
            const dot_t2 = normal_t2.x * up.x + normal_t2.y * up.y + normal_t2.z * up.z;
            let c_t2 = 1.0 - dot_t2;
            c_t2 = (1.0 - Math.cos(c_t2 * c_t2)) / 3.0;
            const alpha_t2 = Math.min(c_t2 * 1.5, 1.0);
            
            if (alpha_t2 > 0.01) {
              ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha_t2})`;
              ctx.beginPath();
              ctx.moveTo(p2.x, p2.y);
              ctx.lineTo(p4.x, p4.y);
              ctx.lineTo(p3.x, p3.y);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }
      
      ctx.globalCompositeOperation = 'source-over';
    };

    const tick = (currentTime: number = 0) => {
      if (animationStartTimeRef.current === 0) {
        animationStartTimeRef.current = currentTime;
      }
      if (enableAnimationTimeout && timeoutMs > 0 && (currentTime - animationStartTimeRef.current >= timeoutMs)) {
        doFrame();
        return;
      }
      if (currentTime - lastFrameTimeRef.current >= frameInterval) {
        timeRef.current += 0.01 * baseSpeedValue;
        doFrame();
        lastFrameTimeRef.current = currentTime;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, waveColor, frameInterval, timeoutMs, enableAnimationTimeout]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: 'linear-gradient(to bottom, #000, #111)' }}
    />
  );
};

/** CSS Dark Particles (animation.10.css-dark-particles) - 200 particules CSS animées montant et descendant */
const CssDarkParticles: React.FC<{ 
  animationSpeed?: AnimationSpeed;
  speed?: number;
  particleCount?: number;
}> = ({ 
  animationSpeed = 0.75,
  speed: customSpeed,
  particleCount: customParticleCount
}) => {
  const particleCount = customParticleCount !== undefined ? customParticleCount : 200;
  
  // Générer les données pour chaque particule
  const particles = useMemo(() => {
    const random = (max: number) => Math.random() * max;
    return Array.from({ length: particleCount }, (_, i) => {
      const circleSize = random(10);
      const startPositionY = random(10) + 100;
      // Durées réduites pour une animation plus rapide (environ 40% plus rapide)
      const moveDuration = 4000 + random(2500); // Réduit de 7000-11000 à 4000-6500
      const delay = random(7000); // Réduit de 11000 à 7000
      const circleDelay = random(2500); // Réduit de 4000 à 2500
      const startX = random(100);
      const endX = random(100);
      const endY = -startPositionY - random(30);
      
      return {
        id: i + 1,
        size: Math.max(2, circleSize),
        startX,
        endX,
        startY: startPositionY,
        endY,
        moveDuration,
        delay,
        circleDelay,
        animationName: `move-frames-${i + 1}`,
      };
    });
  }, [particleCount]);

  // Générer les keyframes CSS dynamiquement
  useEffect(() => {
    const styleId = 'css-dark-particles-styles';
    let styleElement = document.getElementById(styleId) as HTMLStyleElement;
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = styleId;
      document.head.appendChild(styleElement);
    }

    let css = `
      .css-dark-particles-container {
        position: absolute;
        width: 100%;
        height: 100%;
        background: radial-gradient(#021027, #000000);
        overflow: hidden;
      }
      
      .css-dark-particles-circle-container {
        position: absolute;
        transform: translateY(-10vh);
        animation-iteration-count: infinite;
        animation-timing-function: linear;
      }
      
      .css-dark-particles-circle {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        mix-blend-mode: screen;
        background-image: radial-gradient(
          hsl(180, 100%, 80%),
          hsl(180, 100%, 80%) 10%,
          hsla(180, 100%, 80%, 0) 56%
        );
        animation: css-dark-particles-fade 200ms infinite, css-dark-particles-scale calc(1.2s * var(--animation-speed, 1)) infinite;
      }
      
      @keyframes css-dark-particles-fade {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
      }
      
      @keyframes css-dark-particles-scale {
        0% { transform: scale3d(0.4, 0.4, 1); }
        50% { transform: scale3d(2.2, 2.2, 1); }
        100% { transform: scale3d(0.4, 0.4, 1); }
      }
    `;

    // Générer les keyframes de mouvement pour chaque particule
    particles.forEach((particle) => {
      css += `
        .css-dark-particles-circle-container:nth-child(${particle.id}) {
          width: ${particle.size}px;
          height: ${particle.size}px;
          animation-name: ${particle.animationName};
          animation-duration: calc(${particle.moveDuration}ms * var(--animation-speed, 1));
          animation-delay: calc(${particle.delay}ms * var(--animation-speed, 1));
        }
        
        .css-dark-particles-circle-container:nth-child(${particle.id}) .css-dark-particles-circle {
          animation-delay: calc(${particle.circleDelay}ms * var(--animation-speed, 1));
        }
        
        @keyframes ${particle.animationName} {
          from {
            transform: translate3d(${particle.startX}vw, ${particle.startY}vh, 0);
          }
          to {
            transform: translate3d(${particle.endX}vw, ${particle.endY}vh, 0);
          }
        }
      `;
    });

    styleElement.textContent = css;

    return () => {
      // Ne pas supprimer le style car il peut être réutilisé
    };
  }, [particles]);

  return (
    <div className="css-dark-particles-container">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="css-dark-particles-circle-container"
        >
          <div className="css-dark-particles-circle" />
        </div>
      ))}
    </div>
  );
};

/** Canvas Ribbons (animation.79.canvas-ribbons) - Rubans animés avec courbes de Bézier */
const CanvasRibbons: React.FC<{ 
  animationSpeed?: AnimationSpeed;
  speed?: number;
  wavesCount?: number;
  ribbonWidth?: number;
  amplitude?: number;
  rotation?: number;
}> = ({ 
  animationSpeed = 0.75,
  speed: customSpeed,
  wavesCount: customWavesCount,
  ribbonWidth: customRibbonWidth,
  amplitude: customAmplitude,
  rotation: customRotation
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  // Utiliser le paramètre speed personnalisé ou calculer depuis animationSpeed
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Paramètres selon l'original (avec valeurs personnalisables)
    const wavesCount = customWavesCount !== undefined ? customWavesCount : 3;
    const width = customRibbonWidth !== undefined ? customRibbonWidth : 120; // Nombre de lignes par vague
    const baseSpeed = 0.004 * baseSpeedValue; // Ajuster la vitesse de base selon le paramètre
    const speed = [baseSpeed, baseSpeed * 2];
    const amplitude = customAmplitude !== undefined ? customAmplitude : 0.5;
    const rotation = (customRotation !== undefined ? customRotation : 45) * (Math.PI / 180); // Conversion en radians
    const hue = [11, 14];

    // Classe Wave
    class Wave {
      angle: number[];
      speed: number[];
      lines: Line[];
      
      constructor() {
        this.angle = [
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        ];
        
        const rndSpeed = () => {
          const s = speed[0] + Math.random() * (speed[1] - speed[0]);
          return s * (Math.random() > 0.5 ? 1 : -1);
        };
        
        this.speed = [rndSpeed(), rndSpeed(), rndSpeed(), rndSpeed()];
        this.lines = [];
      }
      
      update(color: string) {
        // Mettre à jour les angles avant de créer la ligne (avec vitesse)
        this.angle[0] += this.speed[0];
        this.angle[1] += this.speed[1];
        this.angle[2] += this.speed[2];
        this.angle[3] += this.speed[3];
        
        this.lines.push(new Line(this.angle, color));
        if (this.lines.length > width) {
          this.lines.shift();
        }
      }
      
      draw(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, radius3: number) {
        ctx.lineWidth = 1;
        
        for (let i = 0; i < this.lines.length; i++) {
          const line = this.lines[i];
          const angle = line.angle;
          
          const x1 = centerX - radius * Math.cos(angle[0] * amplitude + rotation);
          const y1 = centerY - radius * Math.sin(angle[0] * amplitude + rotation);
          const x2 = centerX + radius * Math.cos(angle[3] * amplitude + rotation);
          const y2 = centerY + radius * Math.sin(angle[3] * amplitude + rotation);
          const cpx1 = centerX - radius3 * Math.cos(angle[1] * amplitude * 2);
          const cpy1 = centerY - radius3 * Math.sin(angle[1] * amplitude * 2);
          const cpx2 = centerX + radius3 * Math.cos(angle[2] * amplitude * 2);
          const cpy2 = centerY + radius3 * Math.sin(angle[2] * amplitude * 2);
          
          ctx.strokeStyle = line.color;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, x2, y2);
          ctx.stroke();
        }
      }
    }

    // Classe Line
    class Line {
      angle: number[];
      color: string;
      
      constructor(angle: number[], color: string) {
        this.angle = [
          Math.sin(angle[0]),
          Math.sin(angle[1]),
          Math.sin(angle[2]),
          Math.sin(angle[3]),
        ];
        this.color = color;
      }
    }

    // Initialiser les vagues
    const waves: Wave[] = [];
    for (let i = 0; i < wavesCount; i++) {
      waves.push(new Wave());
    }

    // Variables pour la couleur
    let currentHue = hue[0];
    let hueFw = true;
    let lastColor = '';
    let gradient: CanvasGradient | null = null;

    const updateColor = (): string => {
      currentHue += hueFw ? 0.01 * baseSpeedValue : -0.01 * baseSpeedValue;
      
      if (currentHue > hue[1] && hueFw) {
        currentHue = hue[1];
        hueFw = false;
      } else if (currentHue < hue[0] && !hueFw) {
        currentHue = hue[0];
        hueFw = true;
      }
      
      const a = Math.floor(127 * Math.sin(0.3 * currentHue + 0) + 128);
      const b = Math.floor(127 * Math.sin(0.3 * currentHue + 2) + 128);
      const c = Math.floor(127 * Math.sin(0.3 * currentHue + 4) + 128);
      
      return `rgba(${a}, ${b}, ${c}, 0.1)`;
    };

    const tick = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const centerX = w / 2;
      const centerY = h / 2;
      const radius = Math.sqrt(w * w + h * h) / 2;
      const radius3 = radius / 3;

      // Mettre à jour la couleur
      const color = updateColor();
      
      // Effacer (utiliser les dimensions réelles)
      ctx.clearRect(0, 0, w, h);
      
      // Fond avec gradient
      if (!gradient || lastColor !== color) {
        gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#000');
        gradient.addColorStop(1, color);
        lastColor = color;
      }
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      
      // Mettre à jour et dessiner chaque vague
      waves.forEach((wave) => {
        wave.update(color);
        wave.draw(ctx, centerX, centerY, radius, radius3);
      });

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, customWavesCount, customRibbonWidth, customAmplitude, customRotation]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

/** Aurora (animation.90.aurora) - Icelandic Aurora (lovelace-bg-animation v1) */
const AuroraCanvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  blurIntensity?: number;
  colorIntensity?: number;
  streakCount?: number;
  targetFPS?: number;
  animationTimeout?: number;
  enableAnimationTimeout?: boolean;
}> = ({ 
  animationSpeed = 0.75, 
  speed: customSpeed,
  blurIntensity = 60,
  colorIntensity = 0.7,
  streakCount,
  targetFPS: customTargetFPS = 60,
  animationTimeout: timeoutMs = 5000,
  enableAnimationTimeout = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;
  const streaksRef = useRef<AuroraStreakOptimized[]>([]);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const animationStartTimeRef = useRef<number>(0);
  const targetFPS = Math.max(10, Math.min(100, customTargetFPS));
  const frameInterval = 1000 / targetFPS;

  // Générer des streaks d'aurore aléatoires avec pré-calculs
  const generateRandomStreaks = useCallback((): AuroraStreakOptimized[] => {
    const baseColors = [
      [138, 43, 226], // Purple
      [75, 0, 130],   // Indigo
      [0, 191, 255],  // Deep Sky Blue
      [72, 61, 139],  // Dark Slate Blue
      [123, 104, 238], // Medium Slate Blue
      [0, 206, 209],  // Dark Turquoise
      [147, 0, 211],  // Dark Violet
      [30, 144, 255], // Dodger Blue
      [106, 90, 205], // Slate Blue
      [0, 255, 255],  // Cyan
    ];

    const streaks: AuroraStreakOptimized[] = [];
    const numStreaks = streakCount !== undefined 
      ? streakCount 
      : 6 + Math.floor(Math.random() * 3); // 6-8 streaks par défaut

    for (let i = 0; i < numStreaks; i++) {
      const [r, g, b] = baseColors[Math.floor(Math.random() * baseColors.length)];
      const intensity = colorIntensity;
      
      streaks.push({
        x: Math.random(),
        y: Math.random(),
        angle: Math.random() * 360,
        length: 2.0 + Math.random() * 2.0,
        width: 0.8 + Math.random() * 1.5,
        color: [r, g, b],
        speed: 0.5 + Math.random() * 1.0,
        angleSpeed: 0.2 + Math.random() * 0.4,
        // Pré-calculs pour performance
        speedFactor: (0.5 + Math.random() * 1.0) * 0.001,
        angleSpeedFactor: (0.2 + Math.random() * 0.4) * 0.001,
        colorCache: {
          r: Math.floor(r * intensity),
          g: Math.floor(g * intensity),
          b: Math.floor(b * intensity),
          r07: Math.floor(r * intensity * 0.7),
          g07: Math.floor(g * intensity * 0.7),
          b07: Math.floor(b * intensity * 0.7),
          r01: Math.floor(r * intensity * 0.1),
          g01: Math.floor(g * intensity * 0.1),
          b01: Math.floor(b * intensity * 0.1),
        },
      });
    }

    return streaks;
  }, [colorIntensity, streakCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Optimiser le contexte
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialiser les streaks
    streaksRef.current = generateRandomStreaks();

    const drawOptimizedStreak = (streak: AuroraStreakOptimized, width: number, height: number, minDimension: number, timeSpeed: number) => {
      // Utiliser les valeurs pré-calculées
      const baseX = streak.x * width;
      const baseY = streak.y * height;

      // Calculs trigonométriques optimisés
      const offsetX = Math.sin(timeSpeed * streak.speedFactor) * width * 0.2;
      const offsetY = Math.cos(timeSpeed * streak.speedFactor * 0.8) * height * 0.2;

      const centerX = baseX + offsetX;
      const centerY = baseY + offsetY;

      // Calcul d'angle optimisé
      const currentAngle = streak.angle + Math.sin(timeSpeed * streak.angleSpeedFactor) * 45;
      const angleRad = currentAngle * 0.017453292519943295; // Math.PI / 180 pré-calculé

      // Dimensions pré-calculées
      const length = streak.length * minDimension * 0.8;
      const streakWidth = streak.width * minDimension * 0.3;

      // Calculs trigonométriques optimisés pour les extrémités
      const cosAngle = Math.cos(angleRad);
      const sinAngle = Math.sin(angleRad);
      const halfLength = length * 0.5;

      const startX = centerX - cosAngle * halfLength;
      const startY = centerY - sinAngle * halfLength;
      const endX = centerX + cosAngle * halfLength;
      const endY = centerY + sinAngle * halfLength;

      // Créer le gradient avec les couleurs mises en cache
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      const colors = streak.colorCache;

      gradient.addColorStop(0, `rgba(${colors.r01}, ${colors.g01}, ${colors.b01}, 0)`);
      gradient.addColorStop(0.3, `rgba(${colors.r07}, ${colors.g07}, ${colors.b07}, 0.4)`);
      gradient.addColorStop(0.5, `rgba(${colors.r}, ${colors.g}, ${colors.b}, 0.9)`);
      gradient.addColorStop(0.7, `rgba(${colors.r07}, ${colors.g07}, ${colors.b07}, 0.4)`);
      gradient.addColorStop(1, `rgba(${colors.r01}, ${colors.g01}, ${colors.b01}, 0)`);

      // Dessin optimisé
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRad);

      ctx.beginPath();
      ctx.ellipse(0, 0, length * 0.6, streakWidth, 0, 0, 6.283185307179586); // Math.PI * 2 pré-calculé
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.restore();
    };

    const render = (currentTime: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Effacer le canvas
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Configurer le blend mode et le filtre
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `blur(${blurIntensity}px)`;

      // Pré-calculer les valeurs communes
      const minDimension = Math.min(w, h);
      // Utiliser baseSpeedValue qui est toujours positif (0.1-2.0)
      const timeSpeed = timeRef.current * baseSpeedValue;

      // Dessiner chaque streak d'aurore avec calculs optimisés
      for (let i = 0; i < streaksRef.current.length; i++) {
        drawOptimizedStreak(streaksRef.current[i], w, h, minDimension, timeSpeed);
      }

      // Réinitialiser l'état du contexte
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    };

    const animate = (currentTime: number = 0) => {
      if (animationStartTimeRef.current === 0) {
        animationStartTimeRef.current = currentTime;
      }
      if (enableAnimationTimeout && timeoutMs > 0 && (currentTime - animationStartTimeRef.current >= timeoutMs)) {
        render(currentTime);
        return;
      }
      if (currentTime - lastFrameTimeRef.current >= frameInterval) {
        timeRef.current += baseSpeedValue * 16;
        render(currentTime);
        lastFrameTimeRef.current = currentTime;
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, blurIntensity, colorIntensity, generateRandomStreaks, frameInterval, timeoutMs, enableAnimationTimeout]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

interface AuroraStreakOptimized {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  color: number[];
  speed: number;
  angleSpeed: number;
  speedFactor: number;
  angleSpeedFactor: number;
  colorCache: {
    r: number;
    g: number;
    b: number;
    r07: number;
    g07: number;
    b07: number;
    r01: number;
    g01: number;
    b01: number;
  };
}

/** Aurora v2 (animation.92.aurora-v2) - Icelandic Aurora v2 */
const AuroraV2Canvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  blurIntensity?: number;
  colorIntensity?: number;
  streakCount?: number;
  targetFPS?: number;
  animationTimeout?: number;
  enableAnimationTimeout?: boolean;
}> = ({ 
  animationSpeed = 0.75,
  speed: customSpeed,
  blurIntensity = 60,
  colorIntensity = 0.7,
  streakCount,
  targetFPS: customTargetFPS = 60,
  animationTimeout: timeoutMs = 5000,
  enableAnimationTimeout = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;
  const streaksRef = useRef<AuroraStreak[]>([]);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const animationStartTimeRef = useRef<number>(0);
  const targetFPS = Math.max(10, Math.min(100, customTargetFPS));
  const frameInterval = 1000 / targetFPS;

  // Générer des streaks d'aurore aléatoires
  const generateRandomStreaks = useCallback((): AuroraStreak[] => {
    const baseColors = [
      [138, 43, 226], // Purple
      [75, 0, 130],   // Indigo
      [0, 191, 255],  // Deep Sky Blue
      [72, 61, 139],  // Dark Slate Blue
      [123, 104, 238], // Medium Slate Blue
      [0, 206, 209],  // Dark Turquoise
      [147, 0, 211],  // Dark Violet
      [30, 144, 255], // Dodger Blue
      [106, 90, 205], // Slate Blue
      [0, 255, 255],  // Cyan
    ];

    const streaks: AuroraStreak[] = [];
    const numStreaks = streakCount !== undefined 
      ? streakCount 
      : 6 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numStreaks; i++) {
      streaks.push({
        x: Math.random(),
        y: Math.random(),
        angle: Math.random() * 360,
        length: 2.0 + Math.random() * 2.0,
        width: 0.8 + Math.random() * 1.5,
        color: baseColors[Math.floor(Math.random() * baseColors.length)],
        speed: 0.5 + Math.random() * 1.0,
        angleSpeed: 0.2 + Math.random() * 0.4,
      });
    }

    return streaks;
  }, [streakCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Optimiser le contexte
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialiser les streaks
    streaksRef.current = generateRandomStreaks();

    const drawStreak = (streak: AuroraStreak, timeSpeed: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const minDimension = Math.min(w, h);

      // Calculer la position avec animation
      const baseX = streak.x * w;
      const baseY = streak.y * h;
      const offsetX = Math.sin(timeSpeed * streak.speed * 0.001) * w * 0.2;
      const offsetY = Math.cos(timeSpeed * streak.speed * 0.001 * 0.8) * h * 0.2;
      const centerX = baseX + offsetX;
      const centerY = baseY + offsetY;

      // Calculer la rotation
      const currentAngle = streak.angle + Math.sin(timeSpeed * streak.angleSpeed * 0.001) * 45;
      const angleRad = currentAngle * Math.PI / 180;

      // Calculer les dimensions
      const length = streak.length * minDimension * 0.8;
      const streakWidth = streak.width * minDimension * 0.3;

      // Créer le gradient
      const cosAngle = Math.cos(angleRad);
      const sinAngle = Math.sin(angleRad);
      const halfLength = length * 0.5;

      const startX = centerX - cosAngle * halfLength;
      const startY = centerY - sinAngle * halfLength;
      const endX = centerX + cosAngle * halfLength;
      const endY = centerY + sinAngle * halfLength;

      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      const [r, g, b] = streak.color;
      const intensity = colorIntensity;

      gradient.addColorStop(0, `rgba(${Math.floor(r * intensity * 0.1)}, ${Math.floor(g * intensity * 0.1)}, ${Math.floor(b * intensity * 0.1)}, 0)`);
      gradient.addColorStop(0.3, `rgba(${Math.floor(r * intensity * 0.7)}, ${Math.floor(g * intensity * 0.7)}, ${Math.floor(b * intensity * 0.7)}, 0.4)`);
      gradient.addColorStop(0.5, `rgba(${Math.floor(r * intensity)}, ${Math.floor(g * intensity)}, ${Math.floor(b * intensity)}, 0.9)`);
      gradient.addColorStop(0.7, `rgba(${Math.floor(r * intensity * 0.7)}, ${Math.floor(g * intensity * 0.7)}, ${Math.floor(b * intensity * 0.7)}, 0.4)`);
      gradient.addColorStop(1, `rgba(${Math.floor(r * intensity * 0.1)}, ${Math.floor(g * intensity * 0.1)}, ${Math.floor(b * intensity * 0.1)}, 0)`);

      // Dessiner le streak
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angleRad);

      ctx.beginPath();
      ctx.ellipse(0, 0, length * 0.6, streakWidth, 0, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.restore();
    };

    const render = (currentTime: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      // Effacer le canvas
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Configurer le blend mode et le filtre
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `blur(${blurIntensity}px)`;

      const timeSpeed = timeRef.current * baseSpeedValue;

      // Dessiner chaque streak d'aurore
      for (let i = 0; i < streaksRef.current.length; i++) {
        drawStreak(streaksRef.current[i], timeSpeed);
      }

      // Réinitialiser l'état du contexte
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    };

    const animate = (currentTime: number = 0) => {
      if (animationStartTimeRef.current === 0) {
        animationStartTimeRef.current = currentTime;
      }
      if (enableAnimationTimeout && timeoutMs > 0 && (currentTime - animationStartTimeRef.current >= timeoutMs)) {
        render(currentTime);
        return;
      }
      if (currentTime - lastFrameTimeRef.current >= frameInterval) {
        timeRef.current += baseSpeedValue * 16;
        render(currentTime);
        lastFrameTimeRef.current = currentTime;
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, blurIntensity, colorIntensity, generateRandomStreaks, frameInterval, timeoutMs, enableAnimationTimeout]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

interface AuroraStreak {
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  color: number[];
  speed: number;
  angleSpeed: number;
}

/** Bit Ocean (animation.95.bit-ocean) - grille de points animée par bruit, couleurs changeantes (Griffin Moyer / Codepen), port Canvas 2D */
const BitOceanCanvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  pointSize?: number;
}> = ({
  animationSpeed = 0.75,
  speed: customSpeed,
  pointSize: customPointSize = 2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const speedMult = speedToMultiplier(animationSpeed);
  const baseSpeed = customSpeed !== undefined ? Math.max(0.2, Math.min(2.0, customSpeed)) : 0.5 + (speedMult - 0.3) / (3.0 - 0.3) * 1.5;
  const pointSize = Math.max(1, Math.min(5, customPointSize));

  const gridSize = 400;
  const spacing = 5;
  const verticesRef = useRef<Array<{ x: number; z: number }>>([]);
  const colorRef = useRef({
    r: 0, g: 0, b: 255,
    rt: 0, gt: 0, bt: 255,
    rs: 0, gs: 0, bs: 0,
  });

  const noise2D = useMemo(() => {
    const perm = new Uint8Array(512);
    const p = [151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148];
    for (let i = 0; i < 256; i++) perm[i] = perm[256 + i] = p[i % p.length];
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad2 = (hash: number, x: number, y: number) => {
      const h = hash & 3;
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
    };
    return (x: number, y: number): number => {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      const u = fade(x);
      const v = fade(y);
      const A = perm[X] + Y;
      const AA = perm[A];
      const AB = perm[A + 1];
      const B = perm[X + 1] + Y;
      const BA = perm[B];
      const BB = perm[B + 1];
      return (1 + grad2(AA, x, y) * (1 - u) * (1 - v)
        + grad2(BA, x - 1, y) * u * (1 - v)
        + grad2(AB, x, y - 1) * (1 - u) * v
        + grad2(BB, x - 1, y - 1) * u * v) / 2;
    };
  }, []);

  const noise = useCallback((x: number, z: number) => (noise2D(x / 100, z / 100) - 0.5) * 30, [noise2D]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vertices: Array<{ x: number; z: number }> = [];
    for (let x = 0; x < gridSize; x += spacing) {
      for (let z = 0; z < gridSize; z += spacing) {
        vertices.push({ x: x - gridSize / 2, z: z - gridSize });
      }
    }
    verticesRef.current = vertices;

    const cameraZ = 350;
    const cameraY = 150;
    const fovRad = (20 * Math.PI) / 180;
    const tanHalfFov = Math.tan(fovRad / 2);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const randint = (min: number, max: number) => Math.floor(Math.random() * (max - min)) + min;

    const tick = () => {
      timeRef.current += baseSpeed;
      const t = timeRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const aspect = w / h;
      const color = colorRef.current;

      if (Math.abs(color.r - color.rt) >= 5) color.r += color.rs;
      if (Math.abs(color.g - color.gt) >= 5) color.g += color.gs;
      if (Math.abs(color.b - color.bt) >= 5) color.b += color.bs;
      if (Math.abs(color.r - color.rt) < 5 && Math.abs(color.g - color.gt) < 5 && Math.abs(color.b - color.bt) < 5) {
        color.rt = randint(0, 256);
        color.gt = randint(0, 256);
        color.bt = randint(0, 256);
        const divisor = 50;
        color.rs = (color.rt > color.r ? 1 : -1) * randint(5, 46) / divisor;
        color.gs = (color.gt > color.g ? 1 : -1) * randint(5, 46) / divisor;
        color.bs = (color.bt > color.b ? 1 : -1) * randint(5, 46) / divisor;
      }
      const r = Math.round(Math.max(0, Math.min(255, color.r)));
      const g = Math.round(Math.max(0, Math.min(255, color.g)));
      const b = Math.round(Math.max(0, Math.min(255, color.b)));

      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, w, h);

      const scaleY = (h / 2) / tanHalfFov;
      const scaleX = (w / 2) / (tanHalfFov * aspect);
      const centerX = w / 2;
      const centerY = h / 2;

      const vertices = verticesRef.current;
      for (let i = 0; i < vertices.length; i++) {
        const v = vertices[i];
        const y = cameraY + noise(v.x + t / 20, v.z + t / 10);
        const zView = cameraZ - v.z;
        if (zView <= 10) continue;
        const xProj = v.x / zView;
        const yProj = (y - cameraY) / zView;
        const sx = centerX + xProj * scaleX;
        const sy = centerY - yProj * scaleY;
        if (sx < -pointSize || sx > w + pointSize || sy < -pointSize || sy > h + pointSize) continue;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(sx, sy, pointSize, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeed, pointSize, noise]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

/** Alien Blackout (animation.94.alien-blackout) - Alien: Blackout Intro Scene (React + WebGL style, Canvas 2D) */
const AlienBlackoutCanvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  starCount?: number;
  starSize?: number;
  targetFPS?: number;
  animationTimeout?: number;
  enableAnimationTimeout?: boolean;
}> = ({
  animationSpeed = 0.75,
  speed: customSpeed,
  starCount: customStarCount,
  starSize: customStarSize,
  targetFPS: customTargetFPS = 60,
  animationTimeout: timeoutMs = 5000,
  enableAnimationTimeout = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const animationStartTimeRef = useRef<number>(0);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;
  const starCount = customStarCount !== undefined ? customStarCount : 2000;
  const baseStarSize = customStarSize !== undefined ? customStarSize : 2.5;
  const targetFPS = Math.max(10, Math.min(100, customTargetFPS));
  const frameInterval = 1000 / targetFPS;
  const starsRef = useRef<Array<{
    x: number;
    y: number;
    size: number;
    alpha: number;
    twinkle: boolean;
    twinkleSpeed: number;
    initialX: number;
  }>>([]);

  // Fonction Perlin noise simplifiée
  const perlinNoise = (() => {
    const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (t: number, a: number, b: number) => a + t * (b - a);
    const grad = (hash: number, x: number, y: number, z: number) => {
      const h = hash & 15;
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    };
    
    const permutation = [
      151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7,
      225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6,
      148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35,
      11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171,
      168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231,
      83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245,
      40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76,
      132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
      164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5,
      202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16,
      58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44,
      154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253,
      19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246,
      97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
      81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199,
      106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
      138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78,
      66, 215, 61, 156, 180,
    ];
    const p = new Array(512);
    for (let i = 0; i < 256; i++) p[256 + i] = p[i] = permutation[i];

    return (x: number, y: number, z: number) => {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      x -= Math.floor(x);
      y -= Math.floor(y);
      z -= Math.floor(z);
      const u = fade(x);
      const v = fade(y);
      const w = fade(z);
      const A = p[X] + Y;
      const AA = p[A] + Z;
      const AB = p[A + 1] + Z;
      const B = p[X + 1] + Y;
      const BA = p[B] + Z;
      const BB = p[B + 1] + Z;

      return lerp(
        w,
        lerp(
          v,
          lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
          lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))
        ),
        lerp(
          v,
          lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
          lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))
        )
      );
    };
  })();

  const generateStars = useCallback((width: number, height: number) => {
    const stars: typeof starsRef.current = [];
    const cellSize = 100;
    const cellStars = 30;
    const perlinScale = 0.002;
    const perlinSeed = Math.random();
    const perlinMin = 0.45;
    const sizeMin = 1.0;
    const sizeMax = baseStarSize;
    const alphaMin = 0.1;
    const alphaMax = 0.5;

    // Générer des étoiles avec Perlin noise
    const w = Math.ceil((width * 2) / cellSize);
    const h = Math.ceil(height / cellSize);
    const scale = cellSize * perlinScale;

    const cells: Array<{ x: number; y: number; noise: number }> = [];
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const noise = (perlinNoise(x * scale, y * scale, perlinSeed) + 1) / 2;
        cells.push({ x, y, noise });
      }
    }

    const { min, max } = cells.reduce(
      (acc, cell) => {
        if (cell.noise > acc.max) acc.max = cell.noise;
        if (cell.noise < acc.min) acc.min = cell.noise;
        return acc;
      },
      { min: 1, max: 0 }
    );

    cells.forEach(({ x, y, noise }) => {
      let normalizedNoise = (noise - min) / (max - min);
      if (normalizedNoise < perlinMin) return;
      normalizedNoise = (normalizedNoise - perlinMin) / (1 - perlinMin);

      const count = Math.floor(normalizedNoise * cellStars);
      for (let s = 0; s < count; s++) {
        stars.push({
          x: x * cellSize + Math.random() * cellSize,
          y: y * cellSize + Math.random() * cellSize,
          size: sizeMin + Math.random() * (sizeMax - sizeMin),
          alpha: normalizedNoise * (alphaMin + Math.random() * (alphaMax - alphaMin)),
          twinkle: Math.random() > 0.75,
          twinkleSpeed: 5 + Math.random() * 15,
          initialX: x * cellSize + Math.random() * cellSize,
        });
      }
    });

    // Ajouter des étoiles supplémentaires pour atteindre le nombre souhaité
    while (stars.length < starCount) {
      stars.push({
        x: Math.random() * width * 2,
        y: Math.random() * height,
        size: sizeMin + Math.random() * (sizeMax - sizeMin),
        alpha: alphaMin + Math.random() * (alphaMax - alphaMin),
        twinkle: Math.random() > 0.75,
        twinkleSpeed: 5 + Math.random() * 15,
        initialX: Math.random() * width * 2,
      });
    }

    // Limiter au nombre souhaité
    stars.splice(starCount);
    return stars;
  }, [starCount, baseStarSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      // Régénérer les étoiles lors du resize
      starsRef.current = generateStars(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (currentTime: number) => {
      const t = timeRef.current;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const speed = -50 * baseSpeedValue;

      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#ffffff';
      starsRef.current.forEach((star) => {
        star.x = ((star.initialX + t * speed) % (w * 2) + (w * 2)) % (w * 2);
        let alpha = star.alpha;
        if (star.twinkle) {
          const min = 0.2;
          alpha = min * star.alpha + ((Math.sin(t * star.twinkleSpeed) + 1) / 2) * (1 - min) * star.alpha;
        }
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size / 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;
    };

    const tick = (currentTime: number = 0) => {
      if (animationStartTimeRef.current === 0) {
        animationStartTimeRef.current = currentTime;
      }
      if (enableAnimationTimeout && timeoutMs > 0 && (currentTime - animationStartTimeRef.current >= timeoutMs)) {
        render(currentTime);
        return;
      }
      if (currentTime - lastFrameTimeRef.current >= frameInterval) {
        timeRef.current += 0.016 * baseSpeedValue;
        render(currentTime);
        lastFrameTimeRef.current = currentTime;
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, generateStars, frameInterval, timeoutMs, enableAnimationTimeout]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

/** Stars (animation.96.stars) - Étoiles en orbite avec scintillement */
const StarsCanvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  starCount?: number;
  hue?: number;
}> = ({
  animationSpeed = 0.75,
  speed: customSpeed,
  starCount: customStarCount,
  hue: customHue
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gradientCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;
  const starCount = customStarCount !== undefined ? customStarCount : 1200;
  const hue = customHue !== undefined ? customHue : 217;
  const starsRef = useRef<Array<{
    orbitRadius: number;
    radius: number;
    timePassed: number;
    speed: number;
    alpha: number;
  }>>([]);

  // Créer le canvas de gradient en cache
  useEffect(() => {
    const gradientCanvas = document.createElement('canvas');
    gradientCanvas.width = 100;
    gradientCanvas.height = 100;
    const ctx2 = gradientCanvas.getContext('2d');
    if (!ctx2) return;

    const gradient = ctx2.createRadialGradient(50, 50, 0, 50, 50, 50);
    gradient.addColorStop(0.025, '#fff');
    gradient.addColorStop(0.1, `hsl(${hue}, 61%, 33%)`);
    gradient.addColorStop(0.25, `hsl(${hue}, 64%, 6%)`);
    gradient.addColorStop(1, 'transparent');

    ctx2.fillStyle = gradient;
    ctx2.beginPath();
    ctx2.arc(50, 50, 50, 0, Math.PI * 2);
    ctx2.fill();

    gradientCanvasRef.current = gradientCanvas;
  }, [hue]);

  const maxOrbit = (x: number, y: number): number => {
    const max = Math.max(x, y);
    const diameter = Math.round(Math.sqrt(max * max + max * max));
    return diameter / 2;
  };

  const generateStars = useCallback((width: number, height: number) => {
    const stars: typeof starsRef.current = [];
    const maxOrbitRadius = maxOrbit(width, height);

    for (let i = 0; i < starCount; i++) {
      const orbitRadius = Math.random() * maxOrbitRadius;
      stars.push({
        orbitRadius,
        radius: (Math.random() * 60 + orbitRadius) / 10,
        timePassed: Math.random() * starCount,
        speed: (Math.random() * orbitRadius) / 2500000,
        alpha: (Math.random() * 8 + 2) / 10,
      });
    }

    return stars;
  }, [starCount]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w;
      canvas.height = h;
      
      // Régénérer les étoiles lors du resize
      starsRef.current = generateStars(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      const centerX = w / 2;
      const centerY = h / 2;

      // Fond avec fade
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = `hsla(${hue}, 64%, 6%, 1)`;
      ctx.fillRect(0, 0, w, h);

      // Dessiner les étoiles
      ctx.globalCompositeOperation = 'lighter';
      
      if (gradientCanvasRef.current) {
        starsRef.current.forEach((star) => {
          // Calculer la position en orbite
          const x = Math.sin(star.timePassed) * star.orbitRadius + centerX;
          const y = Math.cos(star.timePassed) * star.orbitRadius + centerY;

          // Effet de scintillement aléatoire
          const twinkle = Math.floor(Math.random() * 200);
          let alpha = star.alpha;
          if (twinkle === 1 && alpha > 0) {
            alpha -= 0.03;
          } else if (twinkle === 2 && alpha < 1) {
            alpha += 0.03;
          }
          star.alpha = Math.max(0, Math.min(1, alpha));

          // Dessiner l'étoile avec le gradient en cache
          ctx.globalAlpha = star.alpha;
          ctx.drawImage(
            gradientCanvasRef.current,
            x - star.radius / 2,
            y - star.radius / 2,
            star.radius,
            star.radius
          );

          // Mettre à jour la position
          star.timePassed += star.speed * baseSpeedValue;
        });
      }

      ctx.globalAlpha = 1.0;

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, generateStars, hue]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#000' }}
    />
  );
};

/** Space (animation.97.space) - Effet de tunnel spatial 3D */
const SpaceCanvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  particleCount?: number;
  particleSize?: number;
  defaultSpeed?: number;
  boostSpeed?: number;
}> = ({
  animationSpeed = 0.75,
  speed: customSpeed,
  particleCount: customParticleCount,
  particleSize: customParticleSize,
  defaultSpeed: customDefaultSpeed,
  boostSpeed: customBoostSpeed
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const isMouseDownRef = useRef(false);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;
  const particleCount = customParticleCount !== undefined ? customParticleCount : 500;
  const particleBaseRadius = customParticleSize !== undefined ? customParticleSize : 0.5;
  const defaultSpeedValue = customDefaultSpeed !== undefined ? customDefaultSpeed : 0.4;
  const boostSpeedValue = customBoostSpeed !== undefined ? customBoostSpeed : 300;
  const FL = 500; // Focal length
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    z: number;
    pastZ: number;
  }>>([]);
  const currentSpeedRef = useRef(defaultSpeedValue);
  const targetSpeedRef = useRef(defaultSpeedValue);

  const randomizeParticle = useCallback((p: { x: number; y: number; z: number; pastZ: number }, width: number, height: number) => {
    p.x = Math.random() * width;
    p.y = Math.random() * height;
    p.z = Math.random() * 1500 + 500;
    p.pastZ = p.z;
    return p;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w;
      canvas.height = h;
      
      // Régénérer les particules lors du resize
      particlesRef.current = [];
      for (let i = 0; i < particleCount; i++) {
        const p = { x: 0, y: 0, z: 0, pastZ: 0 };
        randomizeParticle(p, w, h);
        p.z -= 500 * Math.random(); // Décaler certaines particules vers l'arrière
        particlesRef.current.push(p);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    // Gestion de la souris
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };

    const handleMouseDown = () => {
      isMouseDownRef.current = true;
      targetSpeedRef.current = boostSpeedValue * baseSpeedValue;
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
      targetSpeedRef.current = defaultSpeedValue * baseSpeedValue;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    const tick = () => {
      const w = canvas.width;
      const h = canvas.height;
      const centerX = w / 2;
      const centerY = h / 2;
      const mouseX = mouseRef.current.x || centerX;
      const mouseY = mouseRef.current.y || centerY;

      // Fond noir
      ctx.fillStyle = 'rgb(0, 0, 0)';
      ctx.fillRect(0, 0, w, h);

      // Interpolation de la vitesse
      currentSpeedRef.current += (targetSpeedRef.current - currentSpeedRef.current) * 0.01;
      const speed = currentSpeedRef.current;

      // Calculer le centre avec décalage selon la souris
      const cx = centerX - (mouseX - centerX) * 1.25;
      const cy = centerY - (mouseY - centerY) * 1.25;

      ctx.fillStyle = 'rgb(255, 255, 255)';
      ctx.beginPath();

      const halfPi = Math.PI * 0.5;
      const atan2 = Math.atan2;
      const cos = Math.cos;
      const sin = Math.sin;

      particlesRef.current.forEach((p) => {
        p.pastZ = p.z;
        p.z -= speed;

        if (p.z <= 0) {
          randomizeParticle(p, w, h);
          return;
        }

        const rx = p.x - cx;
        const ry = p.y - cy;

        // Projection perspective
        const f = FL / p.z;
        const x = cx + rx * f;
        const y = cy + ry * f;
        const r = particleBaseRadius * f;

        const pf = FL / p.pastZ;
        const px = cx + rx * pf;
        const py = cy + ry * pf;
        const pr = particleBaseRadius * pf;

        // Dessiner un cylindre/traînée entre la position passée et actuelle
        const a = atan2(py - y, px - x);
        const a1 = a + halfPi;
        const a2 = a - halfPi;

        ctx.moveTo(px + pr * cos(a1), py + pr * sin(a1));
        ctx.arc(px, py, pr, a1, a2, true);
        ctx.lineTo(x + r * cos(a2), y + r * sin(a2));
        ctx.arc(x, y, r, a2, a1, true);
        ctx.closePath();
      });

      ctx.fill();

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, particleCount, particleBaseRadius, defaultSpeedValue, boostSpeedValue, randomizeParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: 'hsl(256, 100%, 5%)' }}
    />
  );
};

/** Sidelined (animation.98.sidelined) - Lignes diagonales animées */
const SidelinedCanvas: React.FC<{
  animationSpeed?: AnimationSpeed;
  speed?: number;
  lineCount?: number;
  hue?: number;
}> = ({
  animationSpeed = 0.75,
  speed: customSpeed,
  lineCount: customLineCount,
  hue: customHue
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const speedMult = speedToMultiplier(animationSpeed);
  const defaultSpeed = customSpeed === undefined
    ? Math.max(0.1, Math.min(2.0, 0.1 + ((speedMult - 0.3) / (3.0 - 0.3)) * 1.9))
    : Math.max(0.1, Math.min(2.0, customSpeed));
  const baseSpeedValue = defaultSpeed;
  const lineCount = customLineCount !== undefined ? customLineCount : 3;
  const hue = customHue !== undefined ? customHue : 260;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      canvas.width = w;
      canvas.height = h;
    };
    resize();
    window.addEventListener('resize', resize);

    const tick = (currentTime: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = currentTime;
      }
      
      const w = canvas.width;
      const h = canvas.height;
      const gap = h / (lineCount - 1);
      const outside = w * 0.2;

      // Fond noir
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);

      // Calculer l'offset avec répétition (modulo)
      const elapsed = (currentTime - startTimeRef.current) * baseSpeedValue;
      const offset = (elapsed * -0.022) % gap;

      ctx.lineCap = 'square';

      // Dessiner chaque ligne
      for (let i = 0; i < lineCount; i++) {
        const y = i * gap + offset;
        const progress = 1 - y / h;
        const lineWidth = 1 + progress * 6;

        ctx.beginPath();
        // Ligne du haut gauche vers bas droite
        ctx.moveTo(-outside, -outside);
        ctx.lineTo(w, y);
        // Ligne du bas droite vers haut gauche
        ctx.moveTo(w + outside, h + outside);
        ctx.lineTo(0, h - y);
        
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = `hsla(${hue}, 70%, 60%, ${progress})`;
        
        // Ombre/glow autour des lignes
        ctx.shadowBlur = lineWidth * 2;
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${progress})`;
        
        ctx.stroke();
      }

      // Réinitialiser l'ombre pour éviter les effets indésirables
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [baseSpeedValue, lineCount, hue]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 -z-10 w-full h-full"
      aria-hidden
      style={{ background: '#111' }}
    />
  );
};

export default AnimatedBackground;
