import { useState, useEffect } from 'react';
import { ZoomOut, ZoomIn, Eye, Focus, Maximize2, Minimize } from 'lucide-react';
import { nextZoomSnap } from '../../lib/zoom';
import { cls, IconButton, RangeSlider } from '../ui';

export const FloatingToolbar = ({ zoom, setZoom, isComparing, onCompareStart, onCompareEnd, onCenter, onOneToOne, onFit, isAnimation, isGif, gifTotalFrames, gifCurrentFrame, onSeekGif, videoDuration, videoCurrentTime, onSeekVideo, settings }) => {
    const [tempInput, setTempInput] = useState('100');
    useEffect(() => { setTempInput(Math.round(zoom * 100).toString()); }, [zoom]);

    const handleBlur = () => { const val = parseFloat(tempInput); if (!isNaN(val) && val > 0) setZoom(val / 100); else setTempInput(Math.round(zoom * 100).toString()); };

    const VIDEO_FPS = settings?.videoFps || 30;
    const totalFrames = isGif ? gifTotalFrames : Math.floor((videoDuration || 0) * VIDEO_FPS);
    const currentFrame = isGif ? gifCurrentFrame : Math.floor((videoCurrentTime || 0) * VIDEO_FPS);

    return (
        <div className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 backdrop-blur-md shadow-xl border z-40 transition-all bg-white/90 border-neutral-200 text-neutral-700 dark:bg-neutral-900/90 dark:border-neutral-700 dark:text-neutral-200 flex flex-col gap-1.5 ${isAnimation ? 'w-[96%] max-w-2xl p-2' : 'px-3 py-1.5'}`}>
            <div className="flex items-center justify-center gap-1 w-full">
                 <IconButton onClick={() => setZoom(nextZoomSnap(zoom, -1))} icon={ZoomOut} />
                 <div className="relative flex items-center justify-center">
                   <input type="text" value={tempInput} onChange={(e) => setTempInput(e.target.value)} onBlur={handleBlur} onKeyDown={(e) => e.key === 'Enter' && handleBlur()} className="w-10 bg-transparent text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-neutral-500 px-0.5" />
                   <span className="text-xs font-bold opacity-50">%</span>
                 </div>
                 <IconButton onClick={() => setZoom(nextZoomSnap(zoom, 1))} icon={ZoomIn} />
                 <div className="w-px h-3 mx-1 bg-neutral-300 dark:bg-neutral-700"></div>
                 <button onPointerDown={onCompareStart} onPointerUp={onCompareEnd} onMouseLeave={onCompareEnd} className={`${cls.buttonGhost} ${isComparing ? 'text-neutral-900 bg-neutral-100 dark:text-white dark:bg-neutral-800' : ''}`} title="Hold to Compare"><Eye size={14} /></button>
                 <IconButton onClick={onCenter} icon={Focus} title="Center Image" />
                 <IconButton onClick={onOneToOne} icon={Maximize2} title="1:1 (100%)" />
                 <IconButton onClick={onFit} icon={Minimize} title="Fit to Viewport" />
            </div>

            {isAnimation && (
                <div className="flex items-center gap-3 w-full pt-1.5 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="frame-counter min-w-[3ch] text-right">{currentFrame}</span>
                    <RangeSlider min={0} max={totalFrames ? totalFrames - 1 : 1} step={1} value={currentFrame} onChange={(e) => isGif ? onSeekGif(Number(e.target.value)) : onSeekVideo(Number(e.target.value) / VIDEO_FPS)} className="flex-1" />
                    <span className="frame-counter min-w-[3ch]">{totalFrames}</span>
                </div>
            )}
        </div>
    );
};
