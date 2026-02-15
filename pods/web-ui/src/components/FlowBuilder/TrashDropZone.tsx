import { Trash2 } from "lucide-react";

interface Props {
  isDragging: boolean;
  isOverTrash: boolean;
  trashZoneRef: React.RefObject<HTMLDivElement | null>;
};


const TrashDropZone = ({ isDragging, isOverTrash, trashZoneRef }: Props) => {
  return (
    <>
      <div
        ref={trashZoneRef}
        className={`fixed bottom-8 right-12 z-30 transition-all duration-300 ease-out ${isDragging
            ? 'opacity-100 scale-125 translate-y-0'
            : 'opacity-0 scale-75 translate-y-4 pointer-events-none'
          }`}
      >
        <div
          className={`relative flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 border-dashed transition-all duration-200 ${isOverTrash
                ? 'bg-red-500/20 border-red-500 scale-110 shadow-lg shadow-red-500/30'
                : 'bg-muted/80 border-muted-foreground/30 hover:border-muted-foreground/50'
          }`}
        >
          <Trash2
            className={`transition-all duration-200 ${isOverTrash
                  ? 'w-7 h-7 text-red-500 animate-bounce'
                  : 'w-6 h-6 text-muted-foreground'
            }`}
          />
          <span className={`text-xs text-center mt-1 font-medium transition-colors duration-200 ${isOverTrash ? 'text-red-500' : 'text-muted-foreground'}`}>
            {isOverTrash ? 'Drop to delete' : 'Delete'}
          </span>
       
          {/* Glow effect when hovering */}
          {isOverTrash && (
            <div className="absolute inset-0 rounded-2xl bg-red-500/10 animate-pulse" />
          )}
        </div>
      </div>
    </>
  )
}

export default TrashDropZone
