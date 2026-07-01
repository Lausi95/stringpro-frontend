import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { listCustomers, type CustomerResponse } from '../../lib/api'
import CustomerFormModal from '../../components/CustomerFormModal'

const PAGE_SIZE = 20

export default function CustomersPage() {
  const navigate = useNavigate()

  const [customers, setCustomers] = useState<CustomerResponse[]>([])
  const [totalElements, setTotalElements] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    listCustomers({ page, size: PAGE_SIZE, name: debouncedSearch || undefined })
      .then((data) => {
        setCustomers(data.content)
        setTotalElements(data.totalElements)
        setTotalPages(data.totalPages)
      })
      .catch(() => setFetchError('Failed to load customers.'))
      .finally(() => setLoading(false))
  }, [page, debouncedSearch])

  function openAddModal() {
    setShowAddModal(true)
  }

  return (
    <>
      <div className="page-header">
        <div className="page-header-left">
          <span className="page-eyebrow">{totalElements} customers</span>
          <h1 className="page-title">Customers</h1>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} />
          Add Customer
        </button>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={15} />
            <input
              className="search-input"
              type="search"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {fetchError && (
          <p style={{ color: 'var(--status-overdue-fg)', fontFamily: 'var(--font-body)', padding: 'var(--sp-4) 0' }}>
            {fetchError}
          </p>
        )}

        <div className="data-table-wrap">
          <table className="data-table data-table-customers">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th className="num-col">Rackets</th>
                <th className="num-col">Active Jobs</th>
                <th>Last Job</th>
                <th className="num-col">Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                    Loading…
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--sp-12)', color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>
                    {debouncedSearch ? 'No customers match your search.' : 'No customers yet.'}{' '}
                    {!debouncedSearch && (
                      <button className="btn btn-sm btn-primary" onClick={openAddModal} style={{ marginLeft: 'var(--sp-3)' }}>
                        Add Customer
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/customers/${c.id}`)}
                  >
                    <td><div className="cell-primary">{c.firstName} {c.lastName}</div></td>
                    <td><span className="cell-mono">{c.email}</span></td>
                    <td className="num-col"><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td className="num-col"><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                    <td className="num-col"><span style={{ color: 'var(--fg-muted)', fontSize: 'var(--text-sm)' }}>—</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>
              {page + 1} / {totalPages}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <CustomerFormModal
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSaved={(customer) => navigate(`/customers/${customer.id}`)}
        />
      )}
    </>
  )
}
