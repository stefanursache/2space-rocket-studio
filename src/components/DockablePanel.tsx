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

function nearestSnap(current: number, targets: number[], threshold: number): number {
    let best = current;
    let bestDist = threshold + 1;
    for (const t of targets) {
        const d = Math.abs(current - t);
        if (d <= threshold && d < bestDist) {
            bestDist = d;
            best = t;
        }
    }
    return best;
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
        const onReset = () => {
            setRect(initialRect);
        };
        window.addEventListener('dock-panels-reset', onReset as EventListener);
        return () => {
            window.removeEventListener('dock-panels-reset', onReset as EventListener);
        };
    }, [initialRect]);

    useEffect(() => {
        localStorage.setItem(`dock-panel:${id}`, JSON.stringify(rect));
    }, [id, rect]);

    useEffect(() => {
        if (!action) return;

        const snapThreshold = 14;

        const onPointerMove = (event: PointerEvent) => {
            const panel = panelRef.current;
            const parent = panel?.offsetParent as HTMLElement | null;
            const parentW = parent?.clientWidth ?? window.innerWidth;
            const parentH = parent?.clientHeight ?? window.innerHeight;

            const siblingPanels = Array.from(parent?.querySelectorAll('.dock-panel') || [])
                .filter(el => el !== panel) as HTMLElement[];

            if (action.type === 'drag') {
                const dx = event.clientX - action.startX;
                const dy = event.clientY - action.startY;
                const maxX = Math.max(0, parentW - rect.width);
                const maxY = Math.max(0, parentH - rect.height);

                let nextX = clamp(action.startRect.x + dx, 0, maxX);
                let nextY = clamp(action.startRect.y + dy, 0, maxY);

                const xTargets: number[] = [0, maxX];
                const yTargets: number[] = [0, maxY];

                for (const sib of siblingPanels) {
                    const sx = sib.offsetLeft;
                    const sy = sib.offsetTop;
                    const sw = sib.offsetWidth;
                    const sh = sib.offsetHeight;
                    xTargets.push(
                        sx,
                        sx + sw - rect.width,
                        sx + sw,
                        sx - rect.width,
                    );
                    yTargets.push(
                        sy,
                        sy + sh - rect.height,
                        sy + sh,
                        sy - rect.height,
                    );
                }

                nextX = clamp(nearestSnap(nextX, xTargets, snapThreshold), 0, maxX);
                nextY = clamp(nearestSnap(nextY, yTargets, snapThreshold), 0, maxY);

                setRect(prev => ({
                    ...prev,
                    x: nextX,
                    y: nextY,
                }));
                return;
            }

            const dx = event.clientX - action.startX;
            const dy = event.clientY - action.startY;
            let nextWidth = clamp(action.startRect.width + dx, minWidth, parentW - rect.x);
            let nextHeight = clamp(action.startRect.height + dy, minHeight, parentH - rect.y);

            const rightEdge = rect.x + nextWidth;
            const bottomEdge = rect.y + nextHeight;

            const rightTargets: number[] = [parentW];
            const bottomTargets: number[] = [parentH];

            for (const sib of siblingPanels) {
                rightTargets.push(sib.offsetLeft, sib.offsetLeft + sib.offsetWidth);
                bottomTargets.push(sib.offsetTop, sib.offsetTop + sib.offsetHeight);
            }

            const snappedRight = nearestSnap(rightEdge, rightTargets, snapThreshold);
            const snappedBottom = nearestSnap(bottomEdge, bottomTargets, snapThreshold);

            nextWidth = clamp(snappedRight - rect.x, minWidth, parentW - rect.x);
            nextHeight = clamp(snappedBottom - rect.y, minHeight, parentH - rect.y);

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
