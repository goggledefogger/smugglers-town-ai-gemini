import React, { useEffect, useRef } from 'react';
import { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const API_KEY = import.meta.env.VITE_MAPTILER_API_KEY;
const MAP_API_BASE_URL = "https://api.maptiler.com/maps/";

const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC (Lng, Lat)
export const INITIAL_ZOOM = 17; // Keep consistent with previous setting - Reduced from 19

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

            // Add Water Zone Layer via GeoJSON
            try {
                 const waterZoneGeoJsonCoords = [
                  [-73.99219, 40.75620], // Bottom Left (Lng, Lat)
                  [-73.99100, 40.75620], // Bottom Right
                  [-73.99100, 40.75979], // Top Right
                  [-73.99219, 40.75979], // Top Left
                  [-73.99219, 40.75620]  // Close loop
                ];

                // Check if source already exists before adding
                if (!map.getSource('water-zone-source')) {
                    map.addSource('water-zone-source', {
                        'type': 'geojson',
                        'data': {
                            'type': 'Feature',
                            'geometry': {
                                'type': 'Polygon',
                                'coordinates': [waterZoneGeoJsonCoords]
                            },
                            'properties': {}
                        }
                    });
                }

                // Check if layer already exists before adding
                if (!map.getLayer('water-zone-layer')) {
                    map.addLayer({
                        'id': 'water-zone-layer',
                        'type': 'fill',
                        'source': 'water-zone-source',
                        'layout': {},
                        'paint': {
                            'fill-color': '#0000FF',
                            'fill-opacity': 0.3,
                        }
                    });
                    console.log('[useMapLibre] Water zone GeoJSON layer added to map.');
                }
            } catch (mapLayerError) {
                console.error("[useMapLibre] Error adding water zone layer to map:", mapLayerError);
            }

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

            // Re-add the water zone layer (logic similar to initial load)
            try {
                 const waterZoneGeoJsonCoords = [
                  [-73.99219, 40.75620],
                  [-73.99100, 40.75620],
                  [-73.99100, 40.75979],
                  [-73.99219, 40.75979],
                  [-73.99219, 40.75620]
                ];

                if (!map.getSource('water-zone-source')) {
                     map.addSource('water-zone-source', {
                        'type': 'geojson',
                        'data': {
                            'type': 'Feature',
                            'geometry': {
                                'type': 'Polygon',
                                'coordinates': [waterZoneGeoJsonCoords]
                            },
                            'properties': {}
                        }
                    });
                 }

                if (!map.getLayer('water-zone-layer')) {
                    map.addLayer({
                        'id': 'water-zone-layer',
                        'type': 'fill',
                        'source': 'water-zone-source',
                        'layout': {},
                        'paint': {
                            'fill-color': '#0000FF',
                            'fill-opacity': 0.3,
                        }
                    });
                     console.log('[useMapLibre] Water zone re-added after style change.');
                 }
             } catch (mapLayerError) {
                 console.error("[useMapLibre] Error re-adding water zone layer after style change:", mapLayerError);
            }
        });

    }, [currentMapStyleId]); // Run only when currentMapStyleId changes

    // Expose the map instance ref
    return mapInstance;
}
