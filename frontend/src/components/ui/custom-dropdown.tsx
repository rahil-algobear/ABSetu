import { Fragment, useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Listbox, Transition, ListboxOption, ListboxOptions, ListboxButton } from '@headlessui/react';
import { ChevronUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/20/solid';

export interface DropdownItem {
  id: string;
  label: string;
  disabled?: boolean;
  section?: string;
}

export interface CustomDropdownProps {
  items: DropdownItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  enableSearch?: boolean;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  optionsClassName?: string;
  /** When this number changes, the search input is cleared (e.g., after submit). */
  resetSearchSignal?: number;
}

export default function CustomDropdown({
  items,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  enableSearch = false,
  searchPlaceholder = 'Search...',
  className = '',
  buttonClassName = '',
  optionsClassName = '',
  resetSearchSignal = 0,
}: CustomDropdownProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const openStateRef = useRef(false);
  const prevOpenRef = useRef(false);

  // Avoid hydration mismatch by only rendering interactive Listbox after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Clear search term when parent requests a reset
  useLayoutEffect(() => {
    setSearchTerm('');
  }, [resetSearchSignal]);

  // Clear search term when dropdown opens (transitions from closed to open)
  useLayoutEffect(() => {
    if (openStateRef.current && !prevOpenRef.current && enableSearch) {
      setSearchTerm('');
    }
    prevOpenRef.current = openStateRef.current;
  });

  // Group items by section if they have sections
  const hasSections = items.some(item => item.section);
  const groupedItems = hasSections
    ? items.reduce((acc, item) => {
        const section = item.section || 'Other';
        if (!acc[section]) {
          acc[section] = [];
        }
        acc[section].push(item);
        return acc;
      }, {} as Record<string, DropdownItem[]>)
    : { '': items };

  // Filter items based on search term
  const filteredGroups = Object.entries(groupedItems).reduce((acc, [section, sectionItems]) => {
    const filtered = sectionItems.filter(item =>
      item.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[section] = filtered;
    }
    return acc;
  }, {} as Record<string, DropdownItem[]>);

  const selectedItem = items.find(item => item.id === value);

  // Static placeholder to show during SSR and initial hydration
  // This prevents hydration mismatch from Headless UI's auto-generated IDs
  if (!mounted) {
    return (
      <div className={`relative ${className}`}>
        <div className="relative">
          <button
            type="button"
            className={`relative w-full cursor-default rounded-md bg-gray-50 py-2 pl-3 pr-10 text-left border border-gray-300 hover:bg-gray-100 hover:border-gray-400 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed ${buttonClassName}`}
            title={selectedItem ? selectedItem.label : placeholder}
            disabled={disabled}
          >
            <span className="block truncate text-sm">
              {selectedItem ? selectedItem.label : placeholder}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        {({ open }) => {
          // Update ref to track open state (refs can be updated during render)
          openStateRef.current = open;

          return (
            <div className="relative">
              <ListboxButton
                className={`relative w-full cursor-default rounded-md bg-gray-50 py-2 pl-3 pr-10 text-left border border-gray-300 hover:bg-gray-100 hover:border-gray-400 focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed ${buttonClassName}`}
                title={selectedItem ? selectedItem.label : placeholder}
              >
                <span className="block truncate text-sm">
                  {selectedItem ? selectedItem.label : placeholder}
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                </span>
              </ListboxButton>

              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
            <ListboxOptions
              className={`absolute z-10 max-h-[500px] w-full overflow-auto rounded-md bg-gray-50 text-base shadow-md border border-gray-300 focus:outline-none ${optionsClassName}`}
            >
              {enableSearch && (
                <div className="sticky top-0 z-20 bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500 text-sm bg-white"
                      placeholder={searchPlaceholder}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === ' ') {
                          e.stopPropagation();
                        }
                      }}
                    />
                    <MagnifyingGlassIcon className="absolute left-2 top-1.5 h-5 w-5 text-gray-400" />
                  </div>
                </div>
              )}

              <div className="relative z-10">
                {Object.entries(filteredGroups).map(([section, sectionItems]) => (
                  <div key={section}>
                    {hasSections && section !== '' && (
                      <div className="px-3 py-1.5 text-sm font-medium text-gray-400 bg-white border-b border-gray-200">
                        {section}
                      </div>
                    )}
                    {sectionItems.map((item) => (
                      <ListboxOption
                        key={item.id}
                        value={item.id}
                        disabled={item.disabled}
                        className={({ focus, disabled }) =>
                          `relative cursor-default select-none py-1.5 px-3 ${
                            disabled
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : focus
                              ? 'bg-blue-50'
                              : 'text-black hover:bg-white'
                          }`
                        }
                      >
                        {({ selected, focus }) => (
                          <span
                            className={`block truncate text-sm ${
                              selected ? 'text-blue-700 font-medium' : 'font-normal'
                            }`}
                            title={item.label}
                          >
                            {item.label}
                          </span>
                        )}
                      </ListboxOption>
                    ))}
                  </div>
                ))}
              </div>
            </ListboxOptions>
          </Transition>
        </div>
          );
        }}
      </Listbox>
    </div>
  );
}
