import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "./ui/table"
import { Checkbox } from "./ui/checkbox"

export default function DataTable({ 
  columns, 
  data, 
  loading, 
  emptyMessage = "暂无数据",
  selectable = false,
  selectedRows = [],
  onSelectionChange = null,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  // Check if all rows are selected
  const isAllSelected = selectedRows.length === data.length && data.length > 0

  // Toggle single row selection
  const toggleRow = (rowId) => {
    if (!onSelectionChange) return
    const isSelected = selectedRows.includes(rowId)
    const newSelection = isSelected 
      ? selectedRows.filter(id => id !== rowId)
      : [...selectedRows, rowId]
    onSelectionChange(newSelection)
  }

  // Toggle all rows selection
  const toggleAll = () => {
    if (!onSelectionChange) return
    if (isAllSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(data.map(row => row._id))
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selectable && (
            <TableHead className="w-[50px]">
              <Checkbox
                checked={isAllSelected}
                onCheckedChange={toggleAll}
              />
            </TableHead>
          )}
          {columns.map((col) => (
            <TableHead key={col.key} className={col.className} style={col.width ? { width: col.width } : undefined}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => {
          const isSelected = selectedRows.includes(row._id)
          return (
            <TableRow key={row._id} className={isSelected ? 'bg-muted/50' : ''}>
              {selectable && (
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleRow(row._id)}
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell key={col.key} className={col.cellClassName}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
