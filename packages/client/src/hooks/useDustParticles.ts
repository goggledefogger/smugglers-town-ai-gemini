import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { Player } from '@smugglers-town/shared-schemas';
import { PixiRefs } from './usePixiApp';

// --- Constants (Copied from useGameLoop) ---
const NUM_DUST_PARTICLES = 3;
const DUST_PARTICLE_RADIUS = 6;
const DUST_PARTICLE_COLOR = 0x8B4513; // SaddleBrown
const DUST_PARTICLE_ALPHA = 0.85;
// ------------------------------------------

interface UseDustParticlesProps {
    app: PIXI.Application | null;
    players: Map<string, Player>;
    pixiRefs: React.RefObject<PixiRefs>;
    sessionIdRef: React.RefObject<string | null>;
    carHeight: number;
}

export function useDustParticles({
    app,
    players,
    pixiRefs,
    sessionIdRef,
    carHeight,
}: UseDustParticlesProps): void {
    const playerDustParticlesRef = useRef<Record<string, PIXI.Graphics[]>>({});

    useEffect(() => {
        const currentPixiRefs = pixiRefs.current;
        const currentPlayers = players; // Use the 'players' prop directly from dependencies

        if (!app || !currentPixiRefs || !isFinite(carHeight)) {
            return;
        }

        // --- Dynamic Offsets ---
        const currentCarHeight = carHeight;
        const DUST_OFFSET_BEHIND_MIN = currentCarHeight * 0.1;
        const DUST_OFFSET_BEHIND_SPEED_SCALE = currentCarHeight * 0.1;
        const DUST_OFFSET_SPREAD = currentCarHeight * 0.2;
        // -----------------------

        const currentStageParticleIds = new Set<string>();

        currentPlayers.forEach((playerState, pSessionId) => {
            const currentSessionId = sessionIdRef.current;
            // Get the correct sprite from pixiRefs based on session ID
            let sprite: PIXI.Sprite | null = null;
            if (pSessionId === currentSessionId) {
                sprite = currentPixiRefs.carSprite;
            } else {
                sprite = currentPixiRefs.otherPlayerSprites.current[pSessionId] ?? null;
            }

            if (!sprite || !sprite.visible) {
                // Ensure particles are hidden if sprite is missing or invisible
                const dust = playerDustParticlesRef.current[pSessionId];
                if (dust) dust.forEach(p => { p.visible = false; });
                return;
            }

            currentStageParticleIds.add(pSessionId);

            // --- Calculate Server Speed Magnitude ---
            const serverSpeed = Math.sqrt(playerState.vx * playerState.vx + playerState.vy * playerState.vy);
            const SERVER_SPEED_THRESHOLD = 0.1;
            // -------------------------------------

            let dustParticles = playerDustParticlesRef.current[pSessionId];
            const isOffRoad = !playerState.isOnRoad;

            if (isOffRoad) {
                if (!dustParticles) {
                    dustParticles = [];
                    for (let i = 0; i < NUM_DUST_PARTICLES; i++) {
                        const particle = new PIXI.Graphics();
                        particle.circle(0, 0, DUST_PARTICLE_RADIUS).fill({ color: DUST_PARTICLE_COLOR, alpha: DUST_PARTICLE_ALPHA });
                        particle.visible = false; // Start invisible
                        particle.zIndex = 11; // Ensure dust is above car (car zIndex is 10)
                        app.stage.addChild(particle); // Add particle to the stage
                        dustParticles.push(particle);
                    }
                    playerDustParticlesRef.current[pSessionId] = dustParticles;
                }

                // Position particles (use server speed for offset scaling? Simplified for now)
                const factor = Math.min(1.0, serverSpeed / 10); // Scale offset based on server speed up to ~10 m/s max
                const currentDustOffsetBehind = DUST_OFFSET_BEHIND_MIN + factor * DUST_OFFSET_BEHIND_SPEED_SCALE;

                dustParticles.forEach((particle, i) => {
                    let localX = 0;
                    const localY = currentDustOffsetBehind; // Y is 'behind' in local space

                    if (i === 1) { localX = -DUST_OFFSET_SPREAD * 0.75; }
                    else if (i === 2) { localX = DUST_OFFSET_SPREAD * 0.75; }

                    const localPoint = new PIXI.Point(localX, localY);
                    const globalPoint = sprite.toGlobal(localPoint);

                    const randomX = (Math.random() - 0.5) * DUST_PARTICLE_RADIUS * 1.0;
                    const randomY = (Math.random() - 0.5) * DUST_PARTICLE_RADIUS * 1.0;

                    particle.x = globalPoint.x + randomX;
                    particle.y = globalPoint.y + randomY;
                    particle.alpha = DUST_PARTICLE_ALPHA;
                });
            }

            // --- Visibility check using Server Speed ---
            const isMovingFastEnough = serverSpeed > SERVER_SPEED_THRESHOLD;
            const shouldBeVisible = isOffRoad && isMovingFastEnough;

            const particlesToCheck = dustParticles || playerDustParticlesRef.current[pSessionId];
            if (particlesToCheck) {
                particlesToCheck.forEach(particle => {
                    particle.visible = shouldBeVisible;
                });
            }
            // -------------------------
        });

        // --- Cleanup Stale Particles ---
        // (Players who left but particles might still be in the ref)
        const particleIdsToRemove = Object.keys(playerDustParticlesRef.current).filter(
            pId => !currentStageParticleIds.has(pId)
        );

        particleIdsToRemove.forEach(pId => {
            const dust = playerDustParticlesRef.current[pId];
            if (dust) {
                dust.forEach(p => p.destroy()); // Destroy PIXI objects
            }
            delete playerDustParticlesRef.current[pId]; // Remove from ref
        });
        // -------------------------------

    // Dependencies: Rerun when app, players map, pixiRefs, or carHeight changes.
    // Note: players map identity changes trigger updates.
    }, [app, players, pixiRefs, sessionIdRef, carHeight]);

    // Cleanup on unmount: Destroy all remaining particles
    useEffect(() => {
        return () => {
            if (playerDustParticlesRef.current) {
                Object.values(playerDustParticlesRef.current).forEach(particles => {
                    particles.forEach(p => p.destroy());
                });
            }
            playerDustParticlesRef.current = {};
        };
    }, []); // Empty dependency array ensures this runs only on unmount
}
