'use client';

import { useState } from 'react';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';
import Sidebar from '@/components/Sidebar';
import { Place } from '@/types';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = {
  lat: 0,
  lng: 0,
};

export default function PlacesClient() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  const handleAddPlace = (place: Place) => {
    setPlaces([...places, place]);
  };

  return (
    <main className="flex w-full">
      <Sidebar
        places={places}
        onAddPlace={handleAddPlace}
        selectedPlace={selectedPlace}
        onSelectPlace={setSelectedPlace}
      />
      <div className="flex-1 h-screen">
        <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={defaultCenter}
            zoom={2}
          >
            {places.map((place) => (
              <Marker
                key={place.id}
                position={{ lat: place.latitude, lng: place.longitude }}
                onClick={() => setSelectedPlace(place)}
              />
            ))}
          </GoogleMap>
        </LoadScript>
      </div>
    </main>
  );
}
