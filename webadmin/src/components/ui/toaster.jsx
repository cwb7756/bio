import { useToastStore } from "../../hooks/useToast"
import { cn } from "../../lib/utils"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"

const iconMap = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <AlertCircle className="h-5 w-5 text-red-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
}

export function Toaster() {
  const { toasts, removeToast } = useToastStore()

  return (
    <div className="fixed bottom-0 right-0 z-[100] flex flex-col gap-2 p-4 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border bg-card p-4 shadow-lg animate-in slide-in-from-right-full",
            toast.type === 'success' && "border-green-200",
            toast.type === 'error' && "border-red-200",
            toast.type === 'info' && "border-blue-200"
          )}
        >
          {iconMap[toast.type] || iconMap.info}
          <p className="flex-1 text-sm text-foreground">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
