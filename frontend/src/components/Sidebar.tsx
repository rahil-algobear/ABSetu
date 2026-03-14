'use client';

import { useState } from 'react';
import { Place } from '@/types';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface SidebarProps {
  places: Place[];
  onAddPlace: (place: Place) => void;
  selectedPlace: Place | null;
  onSelectPlace: (place: Place | null) => void;
}

export default function Sidebar({ places, onAddPlace, selectedPlace, onSelectPlace }: SidebarProps) {
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [newPlace, setNewPlace] = useState<Partial<Place>>({
    name: '',
    description: '',
    image_url: '',
    type: '',
    latitude: 0,
    longitude: 0,
    tags: [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPlace.name && newPlace.description && newPlace.type) {
      onAddPlace({
        id: Math.random().toString(36).substr(2, 9),
        ...newPlace,
        tags: [],
      } as Place);
      setNewPlace({
        name: '',
        description: '',
        image_url: '',
        type: '',
        latitude: 0,
        longitude: 0,
        tags: [],
      });
      setIsAddingPlace(false);
    }
  };

  return (
    <div className="w-96 h-screen bg-white shadow-lg overflow-y-auto">
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold">Places</h1>
          <button
            onClick={() => setIsAddingPlace(true)}
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <PlusIcon className="w-6 h-6" />
          </button>
        </div>

        {isAddingPlace && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded-lg w-96">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Add New Place</h2>
                <button
                  onClick={() => setIsAddingPlace(false)}
                  className="p-1 rounded-full hover:bg-gray-100"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={newPlace.name}
                    onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={newPlace.description}
                    onChange={(e) => setNewPlace({ ...newPlace, description: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Image URL</label>
                  <input
                    type="url"
                    value={newPlace.image_url}
                    onChange={(e) => setNewPlace({ ...newPlace, image_url: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <input
                    type="text"
                    value={newPlace.type}
                    onChange={(e) => setNewPlace({ ...newPlace, type: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Add Place
                </button>
              </form>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {places.map((place) => (
            <div
              key={place.id}
              className={`p-4 rounded-lg border cursor-pointer ${
                selectedPlace?.id === place.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
              onClick={() => onSelectPlace(place)}
            >
              <h3 className="font-semibold">{place.name}</h3>
              <p className="text-sm text-gray-600">{place.description}</p>
              <div className="mt-2">
                <span className="inline-block bg-gray-100 rounded-full px-3 py-1 text-sm font-semibold text-gray-600">
                  {place.type}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 