import React, { useEffect, useRef, useState } from 'react';

type Rect = { x: number; y: number; width: number; height: number };

type ActionState =
    | { type: 'drag'; startX: number; startY: number; startRect: Rect }
    | { type: 'resize'; startX: number; startY: number; startRect: Rect }
    | null;

interface DockablePanelProps {
    id: string;
    title: string;
    initialRect: Rect;
    minWidth?: number;
    minHeight?: number;
    children: React.ReactNode;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export const DockablePanel: React.FC<DockablePanelProps> = ({
    id,
    title,
    initialRect,
    minWidth = 260,
    minHeight = 180,
    children,
}) => {
    const [rect, setRect] = useState<Rect>(initialRect);
    const [action, setAction] = useState<ActionState>(null);
    const [zIndex, setZIndex] = useState(10);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem(`dock-panel:${id}`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as Rect;
                if (
                    typeof parsed.x === 'number' &&
                    typeof parsed.y === 'number' &&
                    typeof parsed.width === 'number' &&
                    typeof parsed.height === 'number'
                ) {
                    setRect(parsed);
                }
            } catch {
                // Ignore malformed persisted layout
            }
        }
    }, [id]);

    useEffect(() => {
        localStorage.setItem(`dock-panel:${id}`, JSON.stringify(rect));
    }, [id, rect]);

    useEffect(() => {
        if (!action) return;

        const onPointerMove = (event: PointerEvent) => {
            const panel = panelRef.current;
            const parent = panel?.offsetParent as HTMLElement | null;
            const parentW = parent?.clientWidth ?? window.innerWidth;
            const parentH = parent?.clientHeight ?? window.innerHeight;

            if (action.type === 'drag') {
                const dx = event.clientX - action.startX;
                const dy = event.clientY - action.startY;
                const maxX = Math.max(0, parentW - rect.width);
                const maxY = Math.max(0, parentH - rect.height);

                setRect(prev => ({
                    ...prev,
                    x: clamp(action.startRect.x + dx, 0, maxX),
                    y: clamp(action.startRect.y + dy, 0, maxY),
                }));
                return;
            }

            const dx = event.clientX - action.startX;
            const dy = event.clientY - action.startY;
            const nextWidth = clamp(action.startRect.width + dx, minWidth, parentW - rect.x);
            const nextHeight = clamp(action.startRect.height + dy, minHeight, parentH - rect.y);

            setRect(prev => ({
                ...prev,
                width: nextWidth,
                height: nextHeight,
            }));
        };

        const onPointerUp = () => setAction(null);

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [action, minHeight, minWidth, rect.height, rect.width, rect.x, rect.y]);

    const onBringToFront = () => {
        setZIndex(Date.now() % 100000);
    };

    return (
        <div
            ref={panelRef}
            className="dock-panel"
            style={{
                left: `${rect.x}px`,
                top: `${rect.y}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`,
                zIndex,
            }}
            onPointerDown={onBringToFront}
        >
            <div
                className="dock-panel-header"
                onPointerDown={(event) => {
                    event.preventDefault();
                    onBringToFront();
                    setAction({
                        type: 'drag',
                        startX: event.clientX,
                        startY: event.clientY,
                        startRect: rect,
                    });
                }}
            >
                <span className="dock-panel-title">{title}</span>
            </div>

            <div className="dock-panel-body">{children}</div>

            <div
                className="dock-panel-resize"
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onBringToFront();
                    setAction({
                        type: 'resize',
                        startX: event.clientX,
                        startY: event.clientY,
                        startRect: rect,
                    });
                }}
                title="Resize panel"
            />
        </div>
    );
};
