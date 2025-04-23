import { useRef, useEffect } from 'react';
import * as PIXI from 'pixi.js';
import goldenToiletUrl from '/assets/golden-toilet.svg'; // Adjust path as needed

// Constants (Consider moving shared ones)
const CAR_WIDTH = 10;
const CAR_HEIGHT = 20;

interface UsePixiAppProps {
    pixiContainerRef: React.RefObject<HTMLDivElement>;
    onPixiReady?: (app: PIXI.Application) => void; // Callback when Pixi is ready
}

export interface PixiRefs {
    app: PIXI.Application | null;
    carSprite: PIXI.Graphics | null;
    otherPlayerSprites: React.MutableRefObject<{ [sessionId: string]: PIXI.Graphics }>;
    itemSprites: React.MutableRefObject<Map<string, PIXI.Sprite>>;
    redBaseSprite: PIXI.Graphics | null;
    blueBaseSprite: PIXI.Graphics | null;
    navigationArrowSprite: PIXI.Graphics | null;
    // Add debug refs if they are managed here
    debugCarrierSprite: PIXI.Graphics | null;
    debugStealerSprite: PIXI.Graphics | null;
}

// Helper to draw the car sprite (copied from GameCanvas, consider utils)
function drawCar(graphics: PIXI.Graphics, team: string) {
    graphics.clear();
    const color = team === 'Red' ? 0xff0000 : 0x0000ff;
    const outlineColor = 0xffffff;
    graphics
        .rect(0, 0, CAR_WIDTH, CAR_HEIGHT).fill({ color: color })
        .poly([CAR_WIDTH / 2, -5, CAR_WIDTH, 10, 0, 10]).fill({ color: outlineColor });
    graphics.pivot.set(CAR_WIDTH / 2, CAR_HEIGHT / 2);
}

export function usePixiApp({ pixiContainerRef, onPixiReady }: UsePixiAppProps): React.MutableRefObject<PixiRefs> {
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

                await app.init({ resizeTo: currentPixiContainer, backgroundAlpha: 0, resolution: window.devicePixelRatio || 1, autoDensity: true });
                if (!isMounted.current) return;
                pixiInitComplete.current = true;
                console.log("[usePixiApp] Pixi init ok.");
                currentPixiContainer.appendChild(app.canvas);

                console.log("[usePixiApp] Setting up Pixi stage...");

                // Create placeholder car sprite
                const carGfx = new PIXI.Graphics();
                carGfx.pivot.set(CAR_WIDTH / 2, CAR_HEIGHT / 2);
                carGfx.x = -1000; carGfx.y = -1000;
                carGfx.visible = false;
                app.stage.addChild(carGfx);
                pixiRefs.current.carSprite = carGfx;
                console.log("[usePixiApp] Car sprite placeholder added.");

                // Initialize Item Sprites Map (texture preloading done here)
                pixiRefs.current.itemSprites.current = new Map<string, PIXI.Sprite>();
                try {
                    await PIXI.Assets.load(goldenToiletUrl);
                    console.log(`[usePixiApp] Item asset loaded: ${goldenToiletUrl}`);
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
                ]).fill(0xFFFFFF);
                arrowGfx.pivot.set(0, 0); arrowGfx.position.set(-1000, -1000); arrowGfx.visible = false;
                app.stage.addChild(arrowGfx);
                pixiRefs.current.navigationArrowSprite = arrowGfx;
                console.log("[usePixiApp] Navigation arrow sprite created.");

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
    }, [pixiContainerRef, onPixiReady]); // Dependency on container ref and callback

    return pixiRefs;
}

// Export drawCar if needed by other modules (e.g., game loop)
// Or keep it internal if only used during setup?
export { drawCar };
