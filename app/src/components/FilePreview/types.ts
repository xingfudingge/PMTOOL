/**
 * 公共类型 · FilePreview 子组件统一签名
 */
export interface FilePreviewProps {
  path: string
  fileName: string
  /** 文件大小（bytes · UI 提示用） */
  size?: number
  /** 用本地编辑器打开（open_file_external） */
  onOpenExternally: () => void
  /** 返回上一页（FilesTab 工具栏 · 子组件目前不强制使用） */
  onBack?: () => void
}
