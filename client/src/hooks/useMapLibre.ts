import { useRef, useEffect } from 'react';
import maplibregl, { Map, LngLat } from 'maplibre-gl';

const MAP_STYLE_URL = import.meta.env.VITE_MAPLIBRE_STYLE_URL;
const INITIAL_CENTER: [number, number] = [-73.985, 40.758]; // Times Square, NYC (Lng, Lat)
const INITIAL_ZOOM = 19; // Keep consistent with previous setting

interface UseMapLibreProps {
    mapContainerRef: React.RefObject<HTMLDivElement>;
    onMapLoad?: (map: Map) => void; // Callback when map is loaded
}

export function useMapLibre({ mapContainerRef, onMapLoad }: UseMapLibreProps) {
    const mapInstance = useRef<Map | null>(null);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        if (!mapContainerRef.current || mapInstance.current) return; // Already initialized or container not ready

        if (!MAP_STYLE_URL) {
            console.error("ERROR: VITE_MAPLIBRE_STYLE_URL environment variable is not set!");
            return;
        }

        console.log("[useMapLibre] Initializing MapLibre map...");
        let map: Map;
        try {
            map = new Map({
                container: mapContainerRef.current,
                style: MAP_STYLE_URL,
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

            // Add Water Zone Layer via GeoJSON
            try {
                 const waterZoneGeoJsonCoords = [
                  [-73.99219, 40.75620], // Bottom Left (Lng, Lat)
                  [-73.99100, 40.75620], // Bottom Right
                  [-73.99100, 40.75979], // Top Right
                  [-73.99219, 40.75979], // Top Left
                  [-73.99219, 40.75620]  // Close loop
                ];

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
            } catch (mapLayerError) {
                console.error("[useMapLibre] Error adding water zone layer to map:", mapLayerError);
            }

            // Call the onMapLoad callback if provided
            if (onMapLoad) {
                onMapLoad(map);
            }
        });

        map.on('error', (e) => console.error('[useMapLibre] MapLibre error:', e));

        return () => {
            isMounted.current = false;
            if (mapInstance.current) {
                console.log("[useMapLibre] Removing MapLibre map...");
                mapInstance.current.remove();
                mapInstance.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapContainerRef, onMapLoad]); // Dependency on container ref and callback

    // Expose the map instance ref
    return mapInstance;
}
