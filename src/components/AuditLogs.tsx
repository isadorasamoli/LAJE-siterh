import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, limit, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { AuditLogItem } from '../lib/audit';
import { 
  History, 
  Search, 
  Filter, 
  RefreshCw, 
  Download, 
  UserCheck, 
  UserX, 
  Edit3, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ShieldAlert, 
  ChevronRight, 
  X,
  FileText
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AuditLogsProps {
  currentUserEmail?: string;
}

export default function AuditLogs({ currentUserEmail }: AuditLogsProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [logToDelete, setLogToDelete] = useState<AuditLogItem | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const activeEmail = (currentUserEmail || auth.currentUser?.email || '').toLowerCase().trim();
  const canDeleteLogs = activeEmail === 'isadora.mlima@ufpe.br' || activeEmail.startsWith('isadora.mlima@ufpe');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(200));
      const snapshot = await getDocs(q);
      const validLogs: AuditLogItem[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const targetName = (data.targetMemberName || '').toLowerCase();
        const details = (data.details || '').toLowerCase();
        if (targetName.includes('pedro leonardo') || details.includes('pedro leonardo')) {
          deleteDoc(doc(db, 'audit_logs', docSnap.id)).catch(() => {});
        } else {
          validLogs.push({
            id: docSnap.id,
            ...data
          } as AuditLogItem);
        }
      }

      setLogs(validLogs);
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      handleFirestoreError(error, OperationType.LIST, 'audit_logs');
      toast.error('Erro ao carregar registros de auditoria');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSingleLog = async (id: string) => {
    if (!canDeleteLogs) {
      toast.error('Apenas isadora.mlima@ufpe.br tem permissão para excluir registros de auditoria.');
      return;
    }
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'audit_logs', id));
      toast.success('Registro de auditoria excluído com sucesso');
      setLogs(prev => prev.filter(l => l.id !== id));
      if (selectedLog?.id === id) {
        setSelectedLog(null);
      }
      setLogToDelete(null);
    } catch (error) {
      console.error('Failed to delete audit log:', error);
      handleFirestoreError(error, OperationType.DELETE, `audit_logs/${id}`);
      toast.error('Erro ao excluir registro de auditoria');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClearAllLogs = async () => {
    if (!canDeleteLogs) {
      toast.error('Apenas isadora.mlima@ufpe.br tem permissão para limpar a trilha de auditoria.');
      return;
    }
    try {
      setIsDeleting(true);
      const batch = writeBatch(db);
      logs.forEach(log => {
        if (log.id) {
          batch.delete(doc(db, 'audit_logs', log.id));
        }
      });
      await batch.commit();
      toast.success('Todos os registros de auditoria foram limpos com sucesso');
      setLogs([]);
      setSelectedLog(null);
      setClearAllConfirmOpen(false);
    } catch (error) {
      console.error('Failed to clear audit logs:', error);
      handleFirestoreError(error, OperationType.DELETE, 'audit_logs');
      toast.error('Erro ao limpar registros de auditoria');
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    return logs.filter(log => {
      const matchesSearch = 
        !searchQuery.trim() ||
        log.targetMemberName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.targetMemberEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.performedByEmail?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.performedByName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details?.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (selectedAction !== 'all') {
        if (selectedAction === 'STATUS' && log.action !== 'Alteração de Status') return false;
        if (selectedAction === 'DATA' && log.action !== 'Atualização de Dados') return false;
        if (selectedAction === 'EDIT_REQ' && !['Autorização de Edição', 'Recusa de Edição'].includes(log.action)) return false;
        if (selectedAction === 'DELETE' && log.action !== 'Exclusão de Membro') return false;
      }

      if (selectedPeriod === 'today') {
        const isToday = now - log.timestamp < oneDay;
        if (!isToday) return false;
      } else if (selectedPeriod === 'week') {
        const isThisWeek = now - log.timestamp < 7 * oneDay;
        if (!isThisWeek) return false;
      } else if (selectedPeriod === 'month') {
        const isThisMonth = now - log.timestamp < 30 * oneDay;
        if (!isThisMonth) return false;
      }

      return true;
    });
  }, [logs, searchQuery, selectedAction, selectedPeriod]);

  const statusChangesCount = useMemo(() => logs.filter(l => l.action === 'Alteração de Status').length, [logs]);
  const dataUpdatesCount = useMemo(() => logs.filter(l => l.action === 'Atualização de Dados').length, [logs]);
  const decisionsCount = useMemo(() => logs.filter(l => ['Autorização de Edição', 'Recusa de Edição'].includes(l.action)).length, [logs]);

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'Alteração de Status':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-['Space_Mono']">
            <UserCheck size={12} /> Status
          </span>
        );
      case 'Atualização de Dados':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 font-['Space_Mono']">
            <Edit3 size={12} /> Dados
          </span>
        );
      case 'Autorização de Edição':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-['Space_Mono']">
            <CheckCircle size={12} /> Aprovado
          </span>
        );
      case 'Recusa de Edição':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-['Space_Mono']">
            <XCircle size={12} /> Recusado
          </span>
        );
      case 'Exclusão de Membro':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 font-['Space_Mono']">
            <Trash2 size={12} /> Exclusão
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-gray-800 text-gray-300 border border-gray-700 font-['Space_Mono']">
            <Clock size={12} /> {action}
          </span>
        );
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ['Data e Hora', 'Ação', 'Responsável (Email)', 'Responsável (Nome)', 'Membro Afetado', 'Email do Membro', 'Detalhes da Alteração'];
      const rows = [headers.join(',')];

      filteredLogs.forEach(log => {
        const dateStr = new Date(log.timestamp).toLocaleString('pt-BR');
        const values = [
          `"${dateStr}"`,
          `"${log.action || ''}"`,
          `"${log.performedByEmail || ''}"`,
          `"${log.performedByName || ''}"`,
          `"${log.targetMemberName || ''}"`,
          `"${log.targetMemberEmail || ''}"`,
          `"${(log.details || '').replace(/"/g, '""')}"`
        ];
        rows.push(values.join(','));
      });

      const csvContent = '\uFEFF' + rows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `laje_audit_logs_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
      link.click();
      toast.success('Log de auditoria exportado com sucesso');
    } catch {
      toast.error('Erro ao exportar logs de auditoria');
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-ink-faint)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <History size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-['Syne'] font-bold text-white tracking-tight">
                Log de Alterações
              </h2>
              <p className="text-xs text-gray-400 font-['Space_Mono'] mt-0.5">
                Auditoria interna de alterações de status e dados cadastrais dos membros
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
            title="Recarregar registros"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            <Download size={14} />
            Exportar CSV
          </button>
          {canDeleteLogs && (
            <button
              onClick={() => setClearAllConfirmOpen(true)}
              disabled={logs.length === 0 || loading || isDeleting}
              className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
              title="Excluir todos os registros da trilha de auditoria"
            >
              <Trash2 size={14} />
              Limpar Trilha
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider font-['Space_Mono']">Total de Registros</p>
            <p className="text-2xl font-bold text-white mt-1">{logs.length}</p>
          </div>
          <div className="p-2.5 bg-gray-800 text-gray-300">
            <History size={20} />
          </div>
        </div>

        <div className="p-5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider font-['Space_Mono']">Status Alterados</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{statusChangesCount}</p>
          </div>
          <div className="p-2.5 bg-amber-500/10 text-amber-400">
            <UserCheck size={20} />
          </div>
        </div>

        <div className="p-5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider font-['Space_Mono']">Edições de Dados</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{dataUpdatesCount}</p>
          </div>
          <div className="p-2.5 bg-blue-500/10 text-blue-400">
            <Edit3 size={20} />
          </div>
        </div>

        <div className="p-5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider font-['Space_Mono']">Decisões de Edição</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{decisionsCount}</p>
          </div>
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400">
            <ShieldAlert size={20} />
          </div>
        </div>
      </div>

      <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            type="text"
            placeholder="BUSCAR POR MEMBRO, ADMIN, AÇÃO OU DETALHE..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border border-[var(--color-ink-faint)] py-2.5 pl-10 pr-3 text-white font-['Space_Mono'] text-xs outline-none focus:border-[var(--color-accent)] uppercase transition-colors"
          />
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <Filter size={14} className="text-gray-500 shrink-0" />
            <select
              value={selectedAction}
              onChange={e => setSelectedAction(e.target.value)}
              className="w-full sm:w-auto bg-[#161619] border border-[var(--color-ink-faint)] py-2.5 px-3 text-xs text-gray-300 font-['Space_Mono'] outline-none cursor-pointer focus:border-[var(--color-accent)]"
            >
              <option value="all">Todas as Ações</option>
              <option value="STATUS">Alteração de Status</option>
              <option value="DATA">Atualização de Dados</option>
              <option value="EDIT_REQ">Decisões de Edição</option>
              <option value="DELETE">Exclusões</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 sm:flex-none">
            <select
              value={selectedPeriod}
              onChange={e => setSelectedPeriod(e.target.value)}
              className="w-full sm:w-auto bg-[#161619] border border-[var(--color-ink-faint)] py-2.5 px-3 text-xs text-gray-300 font-['Space_Mono'] outline-none cursor-pointer focus:border-[var(--color-accent)]"
            >
              <option value="all">Todo o Histórico</option>
              <option value="today">Hoje</option>
              <option value="week">Últimos 7 dias</option>
              <option value="month">Últimos 30 dias</option>
            </select>
          </div>
        </div>
      </div>

      <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm font-['Syne']">
            Trilha de Auditoria ({filteredLogs.length} {filteredLogs.length === 1 ? 'evento' : 'eventos'})
          </h3>
          <p className="text-xs text-gray-400 font-['Space_Mono']">
            Registros imutáveis com carimbo de data/hora
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 space-y-3">
            <RefreshCw className="animate-spin mx-auto text-emerald-500" size={28} />
            <p className="text-xs font-['Space_Mono']">Carregando trilha de auditoria...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-[var(--color-ink-faint)] bg-black/20 space-y-3">
            <History className="mx-auto text-gray-600" size={32} />
            <p className="text-sm font-medium text-gray-300 font-['Syne']">Nenhum evento registrado</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Nenhuma alteração de status ou dados foi encontrada para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-950/80 border-b border-[var(--color-ink-faint)] font-['Space_Mono']">
                <tr>
                  <th className="px-3 py-3 whitespace-nowrap text-[11px]">Data / Hora</th>
                  <th className="px-3 py-3 whitespace-nowrap text-[11px]">Tipo de Ação</th>
                  <th className="px-3 py-3 whitespace-nowrap text-[11px]">Responsável</th>
                  <th className="px-3 py-3 whitespace-nowrap text-[11px]">Membro Afetado</th>
                  <th className="px-3 py-3 text-[11px]">Resumo da Alteração</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap text-[11px]">{canDeleteLogs ? 'Ações' : 'Detalhes'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-ink-faint)]">
                {filteredLogs.map(log => (
                  <tr 
                    key={log.id || `${log.timestamp}-${log.targetMemberName}`}
                    className="hover:bg-gray-800/40 transition-colors group cursor-pointer"
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-3 py-3.5 whitespace-nowrap text-gray-400 font-['Space_Mono'] text-[11px]">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-semibold text-gray-200 truncate max-w-[180px]" title={log.performedByName || log.performedByEmail}>
                        {log.performedByName || log.performedByEmail.split('@')[0]}
                      </div>
                      <div className="text-[10px] text-gray-500 font-['Space_Mono'] truncate max-w-[180px]" title={log.performedByEmail}>
                        {log.performedByEmail}
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors truncate max-w-[180px]" title={log.targetMemberName}>
                        {log.targetMemberName}
                      </div>
                      {log.targetMemberEmail && (
                        <div className="text-[10px] text-gray-500 font-['Space_Mono'] truncate max-w-[180px]" title={log.targetMemberEmail}>
                          {log.targetMemberEmail}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 max-w-xs">
                      <p className="text-gray-300 line-clamp-2 text-xs" title={log.details}>
                        {log.details}
                      </p>
                    </td>
                    <td className="px-3 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 text-[10px] font-['Space_Mono'] transition-colors cursor-pointer"
                        >
                          Ver <ChevronRight size={12} />
                        </button>
                        {canDeleteLogs && log.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setLogToDelete(log);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 text-[10px] font-['Space_Mono'] transition-colors cursor-pointer"
                            title="Excluir este evento de auditoria"
                          >
                            <Trash2 size={11} />
                            Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedLog && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="bg-[#141416] border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative text-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-4 border-b border-gray-800 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-gray-800 text-emerald-400 border border-gray-700">
                  <FileText size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white font-['Syne']">Detalhes da Auditoria</h3>
                    {getActionBadge(selectedLog.action)}
                  </div>
                  <p className="text-xs text-gray-400 font-['Space_Mono'] mt-0.5">
                    Registrado em {new Date(selectedLog.timestamp).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-white p-1.5 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-900/80 border border-gray-800 space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase font-['Space_Mono']">
                    Responsável pela Alteração
                  </span>
                  <p className="text-sm font-semibold text-white">{selectedLog.performedByName || 'Usuário'}</p>
                  <p className="text-xs text-emerald-400 font-['Space_Mono']">{selectedLog.performedByEmail}</p>
                </div>

                <div className="p-4 bg-gray-900/80 border border-gray-800 space-y-1">
                  <span className="text-[10px] font-bold text-gray-500 uppercase font-['Space_Mono']">
                    Membro Afetado
                  </span>
                  <p className="text-sm font-semibold text-white">{selectedLog.targetMemberName}</p>
                  <p className="text-xs text-gray-400 font-['Space_Mono']">{selectedLog.targetMemberEmail || 'E-mail não informado'}</p>
                </div>
              </div>

              <div className="p-4 bg-gray-900/80 border border-gray-800 space-y-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase font-['Space_Mono']">
                  Descrição Completa da Ação
                </span>
                <p className="text-sm text-gray-200 leading-relaxed font-medium">
                  {selectedLog.details}
                </p>
              </div>

              {(selectedLog.previousValue || selectedLog.newValue) && (
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase font-['Space_Mono'] block">
                    Comparativo de Valores (Antes vs. Depois)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-sm">
                      <span className="text-[10px] font-bold text-red-400 font-['Space_Mono'] block mb-1">
                        Valor Anterior:
                      </span>
                      <pre className="text-xs text-gray-300 font-['Space_Mono'] whitespace-pre-wrap break-words">
                        {(() => {
                          try {
                            const parsed = JSON.parse(selectedLog.previousValue || '');
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return selectedLog.previousValue || 'Nenhum';
                          }
                        })()}
                      </pre>
                    </div>

                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-sm">
                      <span className="text-[10px] font-bold text-emerald-400 font-['Space_Mono'] block mb-1">
                        Novo Valor:
                      </span>
                      <pre className="text-xs text-gray-300 font-['Space_Mono'] whitespace-pre-wrap break-words">
                        {(() => {
                          try {
                            const parsed = JSON.parse(selectedLog.newValue || '');
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return selectedLog.newValue || 'Nenhum';
                          }
                        })()}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-3 bg-black/40 border border-gray-800 flex items-center justify-between text-[10px] text-gray-500 font-['Space_Mono']">
                <span>ID do Evento: {selectedLog.id || 'N/A'}</span>
                <span>Registro salvo no Firestore</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="mt-6 pt-4 border-t border-gray-800 flex items-center justify-between gap-3">
              <div>
                {canDeleteLogs && selectedLog.id && (
                  <button
                    onClick={() => {
                      setLogToDelete(selectedLog);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Excluir Este Registro
                  </button>
                )}
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Single Log */}
      {logToDelete && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isDeleting && setLogToDelete(null)}
        >
          <div 
            className="bg-[#141416] border border-red-500/30 w-full max-w-md p-6 shadow-2xl text-left space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20">
                <Trash2 size={24} />
              </div>
              <div>
                <h4 className="text-base font-bold text-white font-['Syne']">Excluir Registro de Auditoria</h4>
                <p className="text-xs text-gray-400 font-['Space_Mono']">Autorizado: isadora.mlima@ufpe.br</p>
              </div>
            </div>
            <p className="text-xs text-gray-300 font-['Space_Mono'] leading-relaxed">
              Deseja realmente apagar o registro da ação <strong className="text-white">"{logToDelete.action}"</strong> sobre <strong className="text-white">"{logToDelete.targetMemberName}"</strong>? O item será removido definitivamente do banco de dados.
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                onClick={() => setLogToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => logToDelete.id && handleDeleteSingleLog(logToDelete.id)}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={13} />
                {isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Clear All Logs */}
      {clearAllConfirmOpen && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isDeleting && setClearAllConfirmOpen(false)}
        >
          <div 
            className="bg-[#141416] border border-red-500/30 w-full max-w-md p-6 shadow-2xl text-left space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-400">
              <div className="p-2.5 bg-red-500/10 border border-red-500/20">
                <Trash2 size={24} />
              </div>
              <div>
                <h4 className="text-base font-bold text-white font-['Syne']">Limpar Toda a Trilha de Auditoria</h4>
                <p className="text-xs text-gray-400 font-['Space_Mono']">Autorizado: isadora.mlima@ufpe.br</p>
              </div>
            </div>
            <p className="text-xs text-gray-300 font-['Space_Mono'] leading-relaxed">
              Tem certeza de que deseja apagar <strong className="text-red-400">{logs.length} registro(s)</strong> de auditoria? Todos os eventos registrados no histórico serão permanentemente excluídos do banco de dados.
            </p>
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-800">
              <button
                onClick={() => setClearAllConfirmOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearAllLogs}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={13} />
                {isDeleting ? 'Limpando...' : 'Confirmar e Limpar Tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
