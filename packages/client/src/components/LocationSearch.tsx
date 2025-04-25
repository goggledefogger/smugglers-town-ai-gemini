import React, { useEffect, useRef } from 'react';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import type { GeocodingControlOptions, SearchResult } from '@maptiler/geocoding-control'; // Import types
import '@maptiler/geocoding-control/style.css';
import * as maplibregl from 'maplibre-gl';

interface LocationSearchProps {
    apiKey: string;
    mapInstance: maplibregl.Map | null;
    onResultSelected?: () => void; // Callback when a result is selected
    // Add other options if needed
    controlOptions?: Partial<GeocodingControlOptions>;
}

export const LocationSearch: React.FC<LocationSearchProps> = ({ apiKey, mapInstance, onResultSelected, controlOptions }) => {
    const geocodingControlRef = useRef<GeocodingControl | null>(null);

    useEffect(() => {
        if (!mapInstance || !apiKey || geocodingControlRef.current) {
            // If map or key isn't ready, or control already exists, do nothing
            return;
        }

        // Create the control instance with options
        const gc = new GeocodingControl({
            apiKey: apiKey,
            maplibregl: maplibregl, // Pass the maplibre-gl library object (seems necessary for events?)
            marker: false, // Don't show a marker for the result by default
            flyTo: { speed: 1.8 }, // Adjust animation
            placeholder: "Search Location...",
            ...(controlOptions || {}),
        });

        // --- Add event listener for result selection ---
        const handleSelect = (result: SearchResult | null) => {
            console.log("Geocoding result selected:", result);
            if (result && onResultSelected) {
                onResultSelected(); // Call the callback to disable following
            }
        };
        // The control itself might be the event emitter, or its container?
        // Let's assume the control instance `gc` emits the event.
        // Common event names are 'select', 'result', 'results'. Trying 'select'.
        // Need to cast gc to any if types don't explicitly show event methods.
        (gc as any).on('select', handleSelect);
        // ---------------------------------------------

        // Add the control directly to the map instance
        mapInstance.addControl(gc, 'top-left');

        geocodingControlRef.current = gc; // Store the instance

        // Cleanup function
        return () => {
            // Check if mapInstance still exists and the control ref is set
            if (mapInstance && geocodingControlRef.current) {
                try {
                    // Remove listener before removing control
                    (geocodingControlRef.current as any)?.off('select', handleSelect);
                    mapInstance.removeControl(geocodingControlRef.current);
                } catch (error) {
                    // Tolerate errors during removal, as the map might be destroyed already
                    console.warn("Could not remove GeocodingControl:", error);
                }
                geocodingControlRef.current = null;
            }
        };
        // Ensure effect runs only when map or key changes
    }, [mapInstance, apiKey, controlOptions, onResultSelected]);

    // No need to render a container, MapLibre handles placement
    return null;
};
