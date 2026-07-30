import { Badge } from "./ui/badge"

const statusConfig = {
  active: { label: "正常", variant: "success" },
  banned: { label: "已封禁", variant: "destructive" },
  pending: { label: "待处理", variant: "warning" },
  resolved: { label: "已解决", variant: "success" },
  replied: { label: "已回复", variant: "success" },
  closed: { label: "已关闭", variant: "secondary" },
  published: { label: "已发布", variant: "success" },
  draft: { label: "草稿", variant: "secondary" },
}

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || { label: status, variant: "outline" }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
