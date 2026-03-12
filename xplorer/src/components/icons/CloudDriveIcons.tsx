import { SVGProps } from 'react';
import { Cloud } from 'lucide-react';
import { SiGoogledrive, SiIcloud } from 'react-icons/si';

interface IconProps {
    size?: number;
    color?: string;
}

export const GoogleDriveIcon = ({ size = 16, color = "#0078D7" }: IconProps) => (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Cloud size={size} color={color} />
        <SiGoogledrive
            size={size * 0.5}
            style={{ position: 'absolute', bottom: 0, right: 0 }}
        />
    </div>
);

export const ICloudDriveIcon = ({ size = 16, color = "#0078D7" }: IconProps) => (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <Cloud size={size} color={color} />
        <SiIcloud
            size={size * 0.5}
            style={{ position: 'absolute', bottom: 0, right: 0 }}
        />
    </div>
);
