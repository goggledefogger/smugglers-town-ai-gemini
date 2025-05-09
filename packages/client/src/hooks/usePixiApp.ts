import { useRef, useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { ASSET_PATHS } from '../config/assets'; // <-- ADD
import { DropShadowFilter } from 'pixi-filters'; // <-- ADD

// Constants (Consider moving shared ones)
// REMOVED CAR_WIDTH, CAR_HEIGHT constants as they are passed in or calculated

interface UsePixiAppProps {
    pixiContainerRef: React.RefObject<HTMLDivElement>;
    onPixiReady?: (app: PIXI.Application) => void; // Callback when Pixi is ready
    carHeight: number; // Add carHeight prop
}

export interface PixiRefs {
    app: PIXI.Application | null;
    carSprite: PIXI.Sprite | null;
    otherPlayerSprites: React.MutableRefObject<{ [sessionId: string]: PIXI.Sprite }>;
    itemSprites: React.MutableRefObject<Map<string, PIXI.Sprite>>;
    redBaseSprite: PIXI.Graphics | null;
    blueBaseSprite: PIXI.Graphics | null;
    navigationArrowSprite: PIXI.Graphics | null;
    // Add debug refs if they are managed here
    debugCarrierSprite: PIXI.Graphics | null;
    debugStealerSprite: PIXI.Graphics | null;
}

// Helper to draw the car sprite (copied from GameCanvas, consider utils)
// REMOVED drawCar helper as it's not used with SVG textures

export function usePixiApp({ pixiContainerRef, onPixiReady, carHeight }: UsePixiAppProps): React.MutableRefObject<PixiRefs> { // Add carHeight to signature
    const pixiRefs = useRef<PixiRefs>({
        app: null,
        carSprite: null,
        otherPlayerSprites: { current: {} }, // Initialize inner ref
        itemSprites: { current: new Map() }, // Initialize inner ref
        redBaseSprite: null,
        blueBaseSprite: null,
        navigationArrowSprite: null,
        debugCarrierSprite: null,
        debugStealerSprite: null,
    });

    const isMounted = useRef(false);
    const pixiInitComplete = useRef(false);

    useEffect(() => {
        console.log("[usePixiApp useEffect] START - Running setup...");
        isMounted.current = true;
        pixiInitComplete.current = false;
        let app: PIXI.Application;

        if (!pixiContainerRef.current || pixiRefs.current.app) return; // Already initialized or container not ready
        const currentPixiContainer = pixiContainerRef.current;

        const setupPixi = async () => {
            try {
                console.log("[usePixiApp] Initializing PixiJS application...");
                app = new PIXI.Application();
                pixiRefs.current.app = app;

                await app.init({ 
                    resizeTo: currentPixiContainer, 
                    backgroundAlpha: 0, 
                    resolution: window.devicePixelRatio || 1, 
                    autoDensity: true, 
                    antialias: true // Explicitly enable antialiasing
                });
                if (!isMounted.current) return;
                pixiInitComplete.current = true;
                console.log("[usePixiApp] Pixi init ok.");
                currentPixiContainer.appendChild(app.canvas);

                // Enable z-index sorting for the stage
                app.stage.sortableChildren = true;

                console.log("[usePixiApp] Setting up Pixi stage...");

                // Create car sprite for local player (SVG texture)
                const carTexture = await PIXI.Assets.load(ASSET_PATHS.CAR_SVG); // <-- USE CONSTANT

                // Check if texture loaded correctly
                if (!carTexture || carTexture.width === 0 || carTexture.height === 0) {
                    console.error("[usePixiApp] Failed to load car texture or texture has zero dimensions.");
                    return;
                }
                console.log(`[usePixiApp] Car texture loaded. Dimensions: ${carTexture.width}x${carTexture.height}`);

                const carSprite = new PIXI.Sprite(carTexture);
                carSprite.anchor.set(0.5);

                // Calculate scale based on desired height and texture height
                const scale = carHeight / carTexture.height;
                console.log(`[usePixiApp] Calculated car scale: ${scale} (carHeight=${carHeight})`);
                carSprite.scale.set(scale); // Apply uniform scale

                carSprite.x = -1000; carSprite.y = -1000;
                carSprite.visible = false;
                app.stage.addChild(carSprite);
                pixiRefs.current.carSprite = carSprite;
                console.log("[usePixiApp] Local car sprite added to stage.");

                // Initialize Item Sprites Map (texture preloading done here)
                pixiRefs.current.itemSprites.current = new Map<string, PIXI.Sprite>();
                try {
                    // Preload the golden toilet SVG if needed, though it seems unused in useGameLoop
                    await PIXI.Assets.load(ASSET_PATHS.GOLDEN_TOILET_SVG); // <-- USE CONSTANT (Keep preloading for now)
                    console.log(`[usePixiApp] Item asset loaded: ${ASSET_PATHS.GOLDEN_TOILET_SVG}`); // <-- USE CONSTANT
                } catch (loadError) {
                    console.error("[usePixiApp] Failed to preload item sprite texture:", loadError);
                }

                // Create Base Sprites
                const redBaseGfx = new PIXI.Graphics();
                redBaseGfx.pivot.set(0, 0); redBaseGfx.x = -2000; redBaseGfx.y = -2000; redBaseGfx.visible = false;
                app.stage.addChild(redBaseGfx);
                pixiRefs.current.redBaseSprite = redBaseGfx;
                const blueBaseGfx = new PIXI.Graphics();
                blueBaseGfx.pivot.set(0, 0); blueBaseGfx.x = -2000; blueBaseGfx.y = -2000; blueBaseGfx.visible = false;
                app.stage.addChild(blueBaseGfx);
                pixiRefs.current.blueBaseSprite = blueBaseGfx;
                console.log("[usePixiApp] Base sprite placeholders created.");

                // Create Debug Sprites
                const carrierDebugGfx = new PIXI.Graphics().circle(0, 0, 8).fill(0xff00ff);
                carrierDebugGfx.pivot.set(0, 0); carrierDebugGfx.x = -1000; carrierDebugGfx.y = -1000; carrierDebugGfx.visible = false;
                app.stage.addChild(carrierDebugGfx);
                pixiRefs.current.debugCarrierSprite = carrierDebugGfx;
                const stealerDebugGfx = new PIXI.Graphics().circle(0, 0, 6).fill(0x00ffff);
                stealerDebugGfx.pivot.set(0, 0); stealerDebugGfx.x = -1000; stealerDebugGfx.y = -1000; stealerDebugGfx.visible = false;
                app.stage.addChild(stealerDebugGfx);
                pixiRefs.current.debugStealerSprite = stealerDebugGfx;
                console.log("[usePixiApp] Debug sprites created.");

                // Create Navigation Arrow Sprite
                const arrowGfx = new PIXI.Graphics();
                const arrowHeight = 40; const arrowWidth = 36;
                arrowGfx.poly([
                    { x: 0, y: -arrowHeight / 2 }, { x: arrowWidth / 2, y: arrowHeight / 2 },
                    { x: 0, y: arrowHeight / 4 }, { x: -arrowWidth / 2, y: arrowHeight / 2 }
                ]).fill(0xFFFFFF); // Keep base graphic white for tinting
                arrowGfx.pivot.set(0, 0); arrowGfx.position.set(-1000, -1000); arrowGfx.visible = false;

                // Add drop shadow filter
                const shadowFilter = new DropShadowFilter();
                shadowFilter.color = 0x000000;
                shadowFilter.alpha = 0.7;
                shadowFilter.blur = 4;
                shadowFilter.offset = { x: 0, y: 3 };
                shadowFilter.quality = 3; // Reverted quality from 5 to 3 for performance
                arrowGfx.filters = [shadowFilter];

                app.stage.addChild(arrowGfx);
                pixiRefs.current.navigationArrowSprite = arrowGfx;
                console.log("[usePixiApp] Navigation arrow sprite created with drop shadow.");

                // Call callback if provided
                if (onPixiReady) {
                    onPixiReady(app);
                }

            } catch (error) {
                console.error("[usePixiApp] Pixi init error:", error);
            }
        };

        // Delay setup slightly to ensure container is definitely ready?
        // Or maybe rely on map load triggering pixi setup?
        // For now, just call it directly.
        setupPixi();

        return () => {
            console.log("[usePixiApp useEffect] CLEANUP - Running cleanup...");
            isMounted.current = false;
            if (pixiRefs.current.app && pixiInitComplete.current) {
                console.log("[usePixiApp useEffect CLEANUP] Destroying initialized Pixi app...");
                pixiRefs.current.app.destroy(true, { children: true, texture: true });
                pixiRefs.current = { // Reset refs
                    app: null, carSprite: null, otherPlayerSprites: { current: {} }, itemSprites: { current: new Map() },
                    redBaseSprite: null, blueBaseSprite: null, navigationArrowSprite: null,
                    debugCarrierSprite: null, debugStealerSprite: null
                };
            } else if (pixiRefs.current.app) {
                console.log("[usePixiApp useEffect CLEANUP] Pixi app ref exists but init incomplete, skipping destroy.");
            }
            pixiInitComplete.current = false;
        };
    }, [pixiContainerRef, onPixiReady, carHeight]); // Add carHeight to dependency array

    return pixiRefs;
}

// Export drawCar if needed by other modules (e.g., game loop)
// Or keep it internal if only used during setup?
// REMOVED drawCar export
