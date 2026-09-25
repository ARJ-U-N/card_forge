import * as XLSX from 'xlsx'
import type { Member } from '@/lib/models/types'

const COLUMNS = [
  { header: 'First Name', key: 'firstName' },
  { header: 'Last Name', key: 'lastName' },
  { header: 'Date of Birth', key: 'dateOfBirth' },
  { header: 'Title', key: 'title' },
  { header: 'Gender', key: 'gender' },
  { header: 'Employee ID', key: 'employeeId' },
  { header: 'ID Number', key: 'idNumber' },
  { header: 'Department', key: 'department' },
  { header: 'Hire Date', key: 'hireDate' },
  { header: 'Expire Date', key: 'expireDate' },
  { header: 'Parent Phone', key: 'parentPhone' },
  { header: 'Branch', key: 'branch' },
  { header: 'Room ID', key: 'roomId' },
] as const

export function exportMembersToXlsx(members: Member[], filename = 'members') {
  const data = members.map((m) => {
    const row: Record<string, string> = {}
    for (const col of COLUMNS) {
      row[col.header] = (m as Record<string, unknown>)[col.key] as string ?? ''
    }
    return row
  })

  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Members')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportMembersToCsv(members: Member[], filename = 'members') {
  const data = members.map((m) => {
    const row: Record<string, string> = {}
    for (const col of COLUMNS) {
      row[col.header] = (m as Record<string, unknown>)[col.key] as string ?? ''
    }
    return row
  })

  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export members using the folder's dynamic table columns and customFields.
 * Preserves exact heading names and column order from the folder.
 */
export function exportFolderDataToXlsx(
  members: Member[],
  tableColumns: string[],
  filename = 'members',
) {
  if (tableColumns.length === 0 || members.length === 0) return

  const data = members.map((m) => {
    const row: Record<string, string> = {}
    for (const col of tableColumns) {
      row[col] = m.customFields?.[col] ?? ''
    }
    return row
  })

  const ws = XLSX.utils.json_to_sheet(data, { header: tableColumns })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Members')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

