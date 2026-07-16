import React, { useEffect, useRef } from 'react';
import { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ORIGIN_LNG, ORIGIN_LAT } from '@smugglers-town/shared-utils';

const API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const MAP_API_BASE_URL = "https://api.maptiler.com/maps/";

const INITIAL_CENTER: [number, number] = [ORIGIN_LNG, ORIGIN_LAT];
const INITIAL_ZOOM = 19; // Keep consistent with previous setting

interface UseMapLibreProps {
    mapContainerRef: React.RefObject<HTMLDivElement>;
    currentMapStyleId: string;
    onMapLoad?: (map: Map) => void; // Callback when map is loaded
}

export function useMapLibre({
    mapContainerRef,
    currentMapStyleId,
    onMapLoad
}: UseMapLibreProps) {
    const mapInstance = useRef<Map | null>(null);
    const isMounted = useRef(false);
    const initialStyleLoaded = useRef(false); // Track initial load separately

    // Function to construct the style URL
    const getStyleUrl = (styleId: string): string | null => {
        if (!API_KEY) {
            console.error("ERROR: VITE_MAPTILER_API_KEY environment variable is not set!");
            return null;
        }
        return `${MAP_API_BASE_URL}${styleId}/style.json?key=${API_KEY}`;
    }

    // Effect for initializing the map
    useEffect(() => {
        isMounted.current = true;
        if (!mapContainerRef.current || mapInstance.current) return; // Already initialized or container not ready

        const initialStyleUrl = getStyleUrl(currentMapStyleId);
        if (!initialStyleUrl) return; // API Key missing

        console.log(`[useMapLibre] Initializing MapLibre map with style: ${currentMapStyleId}`);
        let map: Map;
        try {
            map = new Map({
                container: mapContainerRef.current,
                style: initialStyleUrl,
                center: INITIAL_CENTER,
                zoom: INITIAL_ZOOM,
                interactive: false // Keep non-interactive as Pixi handles interaction
            });
            mapInstance.current = map;
        } catch (error) {
            console.error("[useMapLibre] Map init error:", error);
            return;
        }

        map.on('load', () => {
            if (!isMounted.current) return;
            console.log('[useMapLibre] Map loaded.');
            initialStyleLoaded.current = true; // Mark initial style as loaded

            // Water hazards now come from real OSM water polygons (server-side);
            // the basemap already renders real water, so no overlay layer needed.

            // Call the onMapLoad callback if provided
            if (onMapLoad) {
                onMapLoad(map);
            }
        });

        map.on('error', (e) => console.error('[useMapLibre] MapLibre error:', e));

        // Cleanup function
        return () => {
            isMounted.current = false;
            initialStyleLoaded.current = false; // Reset on unmount
            if (mapInstance.current) {
                console.log("[useMapLibre] Removing MapLibre map...");
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapContainerRef, onMapLoad]); // Keep initial dependencies

    // Effect for handling style changes
    useEffect(() => {
        // Only run if map exists, component is mounted, and initial style has loaded
        if (!mapInstance.current || !isMounted.current || !initialStyleLoaded.current) return;

        const newStyleUrl = getStyleUrl(currentMapStyleId);
        if (!newStyleUrl) return; // API Key missing

        console.log(`[useMapLibre] Changing map style to: ${currentMapStyleId}`);

        const map = mapInstance.current;

        // Store current view state
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();

        // Set the new style
        map.setStyle(newStyleUrl);

        // Re-apply view state and water layer after style loads
        map.once('styledata', () => {
             if (!isMounted.current) return; // Check mount status again
             console.log(`[useMapLibre] Style ${currentMapStyleId} loaded.`);

            // Restore map view state
             map.setCenter(center);
             map.setZoom(zoom);
             map.setBearing(bearing);
             map.setPitch(pitch);
        });

    }, [currentMapStyleId]); // Run only when currentMapStyleId changes

    // Expose the map instance ref
    return mapInstance;
}
