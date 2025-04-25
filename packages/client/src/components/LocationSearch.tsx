import React, { useEffect, useRef } from 'react';
import { GeocodingControl } from '@maptiler/geocoding-control/maplibregl';
import type { GeocodingControlOptions, SearchResult } from '@maptiler/geocoding-control'; // Import types
import '@maptiler/geocoding-control/style.css';
import * as maplibregl from 'maplibre-gl';
import { Room } from 'colyseus.js'; // Import Room type
import { ArenaState } from '@smugglers-town/shared-schemas'; // Import ArenaState

interface LocationSearchProps {
    apiKey: string;
    mapInstance: maplibregl.Map | null;
    onResultSelected?: () => void; // Callback when a result is selected (-> disables following)
    onNavigationFinished?: () => void; // Callback when flyTo animation ends (-> enables following)
    room: Room<ArenaState> | null; // Add room prop
    // Add other options if needed
    controlOptions?: Partial<GeocodingControlOptions>;
}

export const LocationSearch: React.FC<LocationSearchProps> = ({
    apiKey,
    mapInstance,
    onResultSelected,
    onNavigationFinished, // Add new prop
    room,
    controlOptions
}: LocationSearchProps) => {
    const geocodingControlRef = useRef<GeocodingControl | null>(null);

    useEffect(() => {
        if (!mapInstance || !apiKey || geocodingControlRef.current) {
            // If map or key isn't ready, or control already exists, do nothing
            return;
        }

        // Create the control instance with options
        const gc = new GeocodingControl({
            apiKey: apiKey,
            maplibregl: maplibregl,
            marker: false,
            flyTo: { speed: 1.8 }, // Re-enable built-in flyTo with original speed
            placeholder: "Search Location...",
            ...(controlOptions || {}),
        });

        // --- Add event listener for final selection ("pick" event) ---
        const handlePick = (evt: { feature: any }) => { // Event likely contains the feature directly
            console.log("[LocationSearch handlePick] Received pick event:", evt);
            const feature = evt.feature; // Extract feature from event

            // Only proceed if we have a valid feature object with a center
            if (feature && feature.center) {
                console.log("[LocationSearch handlePick] Processing picked feature:", feature);

                // Call the original callback (e.g., to disable following)
                if (onResultSelected) {
                    onResultSelected();
                }

                // Send message to server to update world origin
                const featureCenter = feature.center; // Use center from the picked feature

                if (room && Array.isArray(featureCenter) && featureCenter.length === 2) {
                    const [lng, lat] = featureCenter;
                    if (typeof lat === 'number' && typeof lng === 'number') {
                        console.log("[LocationSearch] Successfully sending set_world_origin. Feature object:", feature);
                        console.log(`Sending set_world_origin: Lat=${lat}, Lng=${lng}`);
                        room.send("set_world_origin", { lat, lng });

                        // Keep listening for the end of the (now control-driven) flight animation
                        if (mapInstance) {
                            mapInstance.once('moveend', () => {
                                console.log("[LocationSearch] Control's flyTo animation finished (moveend).");
                                const desiredZoom = 19;
                                mapInstance.setZoom(desiredZoom);
                                if (onNavigationFinished) {
                                    onNavigationFinished();
                                }
                            });
                        }
                    } else {
                        console.warn("Invalid coordinates in picked feature center:", featureCenter);
                    }
                } else {
                     // Log details if the stricter check fails
                     console.warn("Cannot send set_world_origin. Details:", {
                         isRoomAvailable: !!room,
                         hasFeature: !!feature,
                         hasValidFeatureCenter: Array.isArray(featureCenter) && featureCenter.length === 2,
                         featureCenterValue: featureCenter, // Log the actual value
                         pickedEventObject: evt // Log the whole event object
                     });
                }
            } else {
                 console.warn("[LocationSearch handlePick] Received pick event without valid feature:", evt);
            }
        };

        // Use 'pick' event instead of 'select'
        (gc as any).on('pick', handlePick);
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
                    (geocodingControlRef.current as any)?.off('pick', handlePick); // Use pick event here too
                    mapInstance.removeControl(geocodingControlRef.current);
                } catch (error) {
                    // Tolerate errors during removal, as the map might be destroyed already
                    console.warn("Could not remove GeocodingControl:", error);
                }
                geocodingControlRef.current = null;
            }
        };
        // Ensure effect runs only when map or key changes
    }, [mapInstance, apiKey, controlOptions, onResultSelected, onNavigationFinished, room]); // Add room and onNavigationFinished to dependency array

    // No need to render a container, MapLibre handles placement
    return null;
};
