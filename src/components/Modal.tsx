import { type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /**
   * Panel size. `'lg'` widens to ~900px and lays the panel out as a flex column
   * (fixed header, scrollable body, sticky footer) for large forms — see the
   * `.modal-lg` rules in shared.css. Defaults to the standard 540px panel.
   */
  size?: 'default' | 'lg'
}

/**
 * Shared modal shell — backdrop, centered panel, header with title + close.
 * Body and footer are passed as children. Clicking the backdrop closes.
 */
export default function Modal({ title, onClose, children, size = 'default' }: ModalProps) {
  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal${size === 'lg' ? ' modal-lg' : ''}`}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
