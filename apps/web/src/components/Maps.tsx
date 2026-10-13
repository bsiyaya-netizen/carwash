import { useEffect } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';

export interface Pt { lat: number; lng: number }

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; OpenStreetMap contributors';

function Recenter({ center }: { center: Pt }) {
  const map = useMap();
  useEffect(() => { map.setView([center.lat, center.lng]); }, [center.lat, center.lng, map]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (p: Pt) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/** Tap or click the map to drop the pin where the car is parked. */
export function MapPicker({ value, onChange }: { value: Pt; onChange: (p: Pt) => void }) {
  return (
    <MapContainer center={[value.lat, value.lng]} zoom={15} className="map" scrollWheelZoom={false}>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <Recenter center={value} />
      <ClickToPick onPick={onChange} />
      <CircleMarker center={[value.lat, value.lng]} radius={11} pathOptions={{ color: '#fff', weight: 3, fillColor: '#0b2545', fillOpacity: 1 }}>
        <Tooltip permanent direction="top" offset={[0, -10]}>Your car</Tooltip>
      </CircleMarker>
    </MapContainer>
  );
}

export interface Marker extends Pt { label: string; kind: 'car' | 'washer' | 'hub'; onClick?: () => void }

const COLORS = { car: '#0b2545', washer: '#13c4c4', hub: '#f5a524' };

export function PointsMap({ markers, center, tall, zoom = 13 }: { markers: Marker[]; center: Pt; tall?: boolean; zoom?: number }) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} className={`map ${tall ? 'tall' : ''}`} scrollWheelZoom={false}>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      {markers.map((m) => (
        <CircleMarker
          key={`${m.kind}-${m.label}`}
          center={[m.lat, m.lng]}
          radius={m.kind === 'washer' ? 9 : 11}
          pathOptions={{ color: '#fff', weight: 3, fillColor: COLORS[m.kind], fillOpacity: 1 }}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined}
        >
          <Tooltip direction="top" offset={[0, -10]} permanent={m.kind !== 'hub'}>{m.label}</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
