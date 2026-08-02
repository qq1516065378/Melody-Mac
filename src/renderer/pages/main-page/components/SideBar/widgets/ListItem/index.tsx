import SvgAsset, { SvgAssetIconNames } from "@/renderer/components/SvgAsset";
import "./index.scss";

interface IProps {
    selected?: boolean;
    onClick?: () => void;
    onContextMenu?: (...args: any) => void;
    iconName?: SvgAssetIconNames;
    title?: string;
    variant?: "default" | "tile";
}

export default function ListItem(props: IProps) {
    const { selected, onClick, iconName, title, onContextMenu, variant = "default" } = props ?? {};
    return (
        <div
            onClick={onClick}
            onContextMenu={onContextMenu}
            title={title}
            role="button"
            className="side-bar--list-item-container"
            data-selected={selected}
            data-variant={variant}
        >
            {iconName ? <SvgAsset iconName={iconName}></SvgAsset> : null}
            <span>{title ?? ""}</span>
        </div>
    );
}
