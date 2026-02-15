import { Copy, Trash2 } from "lucide-react";

interface Props {
  nodeContextMenu: { x: number; y: number; nodeId: string }
  setNodeContextMenu: (menu: { x: number; y: number; nodeId: string } | null) => void
  duplicateStep: (nodeId: string) => void
  deleteStep: (nodeId: string) => void
}

const NodeContextMenu = ({ nodeContextMenu, setNodeContextMenu, duplicateStep, deleteStep }: Props) => {
  return (
    <>
      <div
        className="fixed z-50 bg-background border border-border rounded-lg shadow-xl py-1.5 min-w-[160px] animate-in fade-in-0 zoom-in-95 duration-150"
        style={{
          left: `${nodeContextMenu.x}px`,
          top: `${nodeContextMenu.y}px`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            duplicateStep(nodeContextMenu.nodeId);
            setNodeContextMenu(null);
          }}
          className="flex items-center w-full px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
        >
          <Copy className="w-4 h-4 mr-2 text-blue-500" />
          Duplicate
        </button>
        <div className="h-px bg-border my-1" />
        <button
          onClick={() => {
            deleteStep(nodeContextMenu.nodeId);
            setNodeContextMenu(null);
          }}
          className="flex items-center w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </button>
      </div>
    </>
  )
}

export default NodeContextMenu
