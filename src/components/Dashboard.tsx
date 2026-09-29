import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Loader2, Users, Target, Activity, X, Search, Download, FileText, Trash2, Edit2, Cake, Gift, Calendar as CalendarIcon, PartyPopper, Sparkles, ChevronLeft, ChevronRight, Mail, Copy, Bell, BellRing, Check, History, Gamepad2, Briefcase, Kanban, Filter, RotateCcw, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logAuditAction } from '../lib/audit';

interface DashboardProps {
  onNavigateTab?: (tab: 'form' | 'projects' | 'dashboard' | 'calendar' | 'logs' | 'settings') => void;
}

export default function Dashboard({ onNavigateTab }: DashboardProps = {}) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'former'>('all');
  const [viewMonthDate, setViewMonthDate] = useState<Date>(new Date());
  const [isAlertPopoverOpen, setIsAlertPopoverOpen] = useState(false);
  const hasNotifiedBirthdaysRef = useRef(false);
  
  const [isEditStatusOpen, setIsEditStatusOpen] = useState(false);
  const [deletionReason, setDeletionReason] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'responses'));
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setData(docs);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'responses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const distinctRoles: string[] = Array.from(
    new Set<string>(
      data.flatMap(m => 
        m.leagueRole 
          ? String(m.leagueRole).split(',').map((r: string) => r.trim()).filter(Boolean)
          : []
      )
    )
  ).sort();

  const distinctProjects: string[] = Array.from(
    new Set<string>(
      data.flatMap(m => 
        m.currentProjects 
          ? String(m.currentProjects).split(',').map((p: string) => p.trim()).filter((p: string) => p && p.toLowerCase() !== 'nenhum')
          : []
      )
    )
  ).sort();

  const countByRole = (role: string) => {
    return data.filter(m => {
      if (!m.leagueRole) return false;
      const roles = String(m.leagueRole).toLowerCase().split(',').map((r: string) => r.trim());
      return roles.some((r: string) => r.includes(role.toLowerCase()) || role.toLowerCase().includes(r));
    }).length;
  };

  const countByProjectStatus = {
    in_project: data.filter(m => 
      m.isInProject === 'Sim' || 
      (m.currentProjects && m.currentProjects.trim().length > 0 && m.currentProjects.toLowerCase() !== 'nenhum')
    ).length,
    waiting_invite: data.filter(m => {
      const hasProj = m.isInProject === 'Sim' || (m.currentProjects && m.currentProjects.trim().length > 0 && m.currentProjects.toLowerCase() !== 'nenhum');
      return !hasProj && (
        m.interestedProjects || 
        m.notInProjectStatus?.includes('Quero entrar') || 
        m.notInProjectStatus?.includes('Já tentei')
      );
    }).length,
    observing: data.filter(m => 
      m.notInProjectStatus?.includes('acompanhar') || 
      m.notInProjectStatus?.includes('curiosidade')
    ).length,
    no_project: data.filter(m => 
      m.isInProject === 'Não' || 
      !m.currentProjects || 
      m.currentProjects.trim().length === 0 || 
      m.currentProjects.toLowerCase() === 'nenhum'
    ).length,
  };

  const isFilterActive = searchQuery.trim() !== '' || roleFilter !== 'all' || projectStatusFilter !== 'all' || statusFilter !== 'all';

  const handleClearFilters = () => {
    setSearchQuery('');
    setRoleFilter('all');
    setProjectStatusFilter('all');
    setStatusFilter('all');
  };

  const filteredData = data.filter(member => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matchName = member.name?.toLowerCase().includes(query);
      const matchEmail = member.email?.toLowerCase().includes(query);
      const matchCourse = member.course?.toLowerCase().includes(query);
      const matchProject = member.currentProjects?.toLowerCase().includes(query);
      if (!matchName && !matchEmail && !matchCourse && !matchProject) {
        return false;
      }
    }

    if (roleFilter !== 'all') {
      if (!member.leagueRole) return false;
      const memberRoles = String(member.leagueRole).toLowerCase().split(',').map((r: string) => r.trim());
      const targetRole = roleFilter.toLowerCase().trim();
      const matchesRole = memberRoles.some((r: string) => r.includes(targetRole) || targetRole.includes(r));
      if (!matchesRole) return false;
    }

    if (projectStatusFilter !== 'all') {
      const hasProject = 
        member.isInProject === 'Sim' || 
        (member.currentProjects && member.currentProjects.trim().length > 0 && member.currentProjects.toLowerCase() !== 'nenhum');
      
      const isWaiting = 
        !hasProject && (
          member.interestedProjects || 
          member.notInProjectStatus?.includes('Quero entrar') || 
          member.notInProjectStatus?.includes('Já tentei')
        );

      const isObserving = 
        member.notInProjectStatus?.includes('acompanhar') || 
        member.notInProjectStatus?.includes('curiosidade');

      if (projectStatusFilter === 'in_project') {
        if (!hasProject) return false;
      } else if (projectStatusFilter === 'no_project') {
        if (hasProject) return false;
      } else if (projectStatusFilter === 'waiting_invite') {
        if (!isWaiting) return false;
      } else if (projectStatusFilter === 'observing') {
        if (!isObserving) return false;
      } else if (projectStatusFilter.startsWith('project:')) {
        const targetProj = projectStatusFilter.replace('project:', '').toLowerCase().trim();
        const memberProj = (member.currentProjects || '').toLowerCase();
        if (!memberProj.includes(targetProj)) return false;
      }
    }

    if (statusFilter === 'active') {
      if (member.status === 'Ex-membro') return false;
    } else if (statusFilter === 'former') {
      if (member.status !== 'Ex-membro') return false;
    }

    return true;
  });

  const activeMembers = filteredData.filter(m => m.status !== 'Ex-membro');
  const activeCount = activeMembers.length;
  const totalCount = filteredData.length;
  
  const allProjects = new Set();
  activeMembers.forEach(m => {
    if (m.currentProjects) {
      m.currentProjects.split(',').map((p: string) => p.trim()).filter((p: string) => p).forEach((p: string) => allProjects.add(p.toLowerCase()));
    }
  });
  const totalActiveProjects = allProjects.size;

  const membersInProjects = activeMembers.filter(m => 
    (m.isInProject === 'Sim') || 
    (m.currentProjects && m.currentProjects.trim().length > 0 && m.currentProjects.toLowerCase() !== 'nenhum')
  );
  const membersWaitingInvite = activeMembers.filter(m => 
    (!m.currentProjects || m.currentProjects.trim().length === 0 || m.currentProjects.toLowerCase() === 'nenhum' || m.isInProject === 'Não') &&
    (m.interestedProjects || m.notInProjectStatus?.includes('Quero entrar') || m.notInProjectStatus?.includes('Já tentei'))
  );
  const membersObserving = activeMembers.filter(m => 
    m.notInProjectStatus?.includes('acompanhar') || m.notInProjectStatus?.includes('curiosidade')
  );

  const avgLeagueFocus = activeCount ? (activeMembers.reduce((acc, curr) => acc + (curr.leagueFocus || 0), 0) / activeCount).toFixed(1) : '0';
  const avgProgress = activeCount ? Math.round(activeMembers.reduce((acc, curr) => acc + (curr.progress || 0), 0) / activeCount) : 0;

  const rolesCount = activeMembers.reduce((acc: any, curr) => {
    const roles = curr.leagueRole
      ? String(curr.leagueRole).split(',').map((r: string) => r.trim()).filter(Boolean)
      : ['Não informado'];
    roles.forEach((role: string) => {
      acc[role] = (acc[role] || 0) + 1;
    });
    return acc;
  }, {});
  
  const chartData = Object.keys(rolesCount).map(role => ({
    name: role,
    Membros: rolesCount[role]
  }));

  const parseBirthday = (birthdayStr?: string) => {
    if (!birthdayStr || typeof birthdayStr !== 'string') return null;
    const str = birthdayStr.trim();
    let day: number | null = null;
    let month: number | null = null;
    let year: number | null = null;

    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        } else {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          year = parts[2].length === 4 ? parseInt(parts[2], 10) : null;
        }
      }
    } else if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          day = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          year = parseInt(parts[2], 10);
        } else if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        }
      }
    }

    if (!day || !month || isNaN(day) || isNaN(month) || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    return { day, month, year };
  };

  const today = new Date();
  const viewMonthNum = viewMonthDate.getMonth() + 1; // 1-12
  const viewYear = viewMonthDate.getFullYear();
  const isCurrentCalendarMonth = 
    viewMonthDate.getMonth() === today.getMonth() && 
    viewMonthDate.getFullYear() === today.getFullYear();

  const monthNameRaw = viewMonthDate.toLocaleDateString('pt-BR', { month: 'long' });
  const viewMonthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

  // Month birthdays calculation (active members only)
  const monthBirthdays = activeMembers
    .map(member => {
      const parsed = parseBirthday(member.birthday);
      if (!parsed || parsed.month !== viewMonthNum) return null;

      const isToday = isCurrentCalendarMonth && parsed.day === today.getDate();
      const daysUntil = isCurrentCalendarMonth ? parsed.day - today.getDate() : null;
      
      let turningAge: number | undefined = undefined;
      if (parsed.year && !isNaN(parsed.year) && parsed.year > 1900) {
        turningAge = viewYear - parsed.year;
        if (turningAge < 0) turningAge = undefined;
      }

      return {
        member,
        day: parsed.day,
        month: parsed.month,
        year: parsed.year,
        turningAge,
        isToday,
        daysUntil,
        formattedBirthday: `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}`
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.day - b.day);

  const todayBirthdays = monthBirthdays.filter(b => b.isToday);

  // Active members who have birthday TODAY in real time (independent of viewMonthDate and current search filters)
  const realMonth = today.getMonth() + 1;
  const realDay = today.getDate();
  const realYear = today.getFullYear();

  const allActiveMembers = data.filter(m => m.status !== 'Ex-membro');
  const activeTodayBirthdays = allActiveMembers
    .map(member => {
      const parsed = parseBirthday(member.birthday);
      if (!parsed) return null;
      if (parsed.month === realMonth && parsed.day === realDay) {
        let turningAge: number | undefined = undefined;
        if (parsed.year && !isNaN(parsed.year) && parsed.year > 1900) {
          turningAge = realYear - parsed.year;
          if (turningAge < 0) turningAge = undefined;
        }
        return {
          member,
          day: parsed.day,
          month: parsed.month,
          year: parsed.year,
          turningAge,
          formattedBirthday: `${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}`
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const triggerBirthdayToast = (birthdays: typeof activeTodayBirthdays) => {
    if (!birthdays || birthdays.length === 0) return;
    const count = birthdays.length;
    const names = birthdays.map(b => b.member.name).join(', ');

    toast(
      (t) => (
        <div className="flex items-start gap-3 py-1 text-left">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-xl shrink-0">
            🎂
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-sm text-white">
              <Sparkles size={14} className="text-amber-400" />
              <span>{count === 1 ? 'Aniversariante do Dia!' : 'Aniversariantes de Hoje!'}</span>
            </div>
            <p className="text-xs text-gray-300 mt-1">
              <strong className="text-amber-300">{names}</strong> {count === 1 ? 'está comemorando aniversário hoje!' : 'estão comemorando aniversário hoje!'}
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => {
                  handleCopyCongrats(birthdays[0].member);
                  toast.dismiss(t.id);
                }}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-[11px] font-['Space_Mono'] uppercase transition-colors cursor-pointer"
              >
                {count === 1 ? 'Copiar Parabéns' : 'Parabenizar'}
              </button>
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  document.getElementById('aniversariantes-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[11px] font-medium transition-colors cursor-pointer border border-gray-700"
              >
                Ver no Dashboard
              </button>
            </div>
          </div>
          <button
            onClick={() => toast.dismiss(t.id)}
            className="text-gray-400 hover:text-white p-1 -mr-1 -mt-1 cursor-pointer"
            title="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      ),
      {
        id: 'birthday-today-toast',
        duration: 9000,
        position: 'top-right',
        style: {
          background: '#161619',
          color: '#fff',
          border: '1px solid rgba(245, 158, 11, 0.5)',
          boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.7), 0 0 20px rgba(245, 158, 11, 0.2)',
          borderRadius: '8px',
          padding: '12px 14px',
          maxWidth: '420px',
        },
      }
    );
  };

  useEffect(() => {
    if (!loading && activeTodayBirthdays.length > 0 && !hasNotifiedBirthdaysRef.current) {
      hasNotifiedBirthdaysRef.current = true;
      triggerBirthdayToast(activeTodayBirthdays);
    }
  }, [loading, activeTodayBirthdays.length]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-emerald-500">
        <Loader2 className="animate-spin mb-4" size={32} />
        <p className="text-sm font-medium text-gray-400">Carregando métricas...</p>
      </div>
    );
  }

  const handleCopyCongrats = (member: any) => {
    const text = `Parabéns pelo seu aniversário, ${member.name}! 🎂 Toda a equipe da LAJE deseja um novo ciclo com muito sucesso, saúde e realizações!`;
    navigator.clipboard.writeText(text);
    toast.success('Mensagem de parabéns copiada!');
  };

  const handleAuthorizeEdit = async (member: any, approved: boolean) => {
    try {
      const history = member.editHistory || [];
      history.push({ action: approved ? 'Aprovado' : 'Recusado', timestamp: Date.now() });
      
      const updateData = approved ? {
        editAuthorized: true,
        editRequestStatus: null,
        editHistory: history
      } : {
        editAuthorized: false,
        editRequestStatus: 'rejected',
        editHistory: history
      };
      
      await updateDoc(doc(db, 'responses', member.id), updateData);

      // Audit Log
      await logAuditAction({
        action: approved ? 'Autorização de Edição' : 'Recusa de Edição',
        targetMemberId: member.id,
        targetMemberName: member.name || 'Membro',
        targetMemberEmail: member.email || '',
        details: approved 
          ? `Administrador aprovou a solicitação de edição de dados cadastrais para "${member.name}"`
          : `Administrador recusou a solicitação de edição de dados cadastrais para "${member.name}"`,
        previousValue: JSON.stringify({ editRequestStatus: member.editRequestStatus || 'pending', editAuthorized: !!member.editAuthorized }),
        newValue: JSON.stringify({ editRequestStatus: approved ? null : 'rejected', editAuthorized: approved }),
      });

      toast.success(approved ? 'Edição autorizada com sucesso!' : 'Edição recusada com sucesso!');
      fetchData();
      setSelectedMember({ ...member, ...updateData });
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar solicitação de edição');
    }
  };

  const handleExportCSV = () => {
    try {
      const headers = ['Data', 'Nome', 'Email', 'Aniversário', 'Curso', 'Período', 'Área', 'Dedicação Semanal', 'Foco na Função', 'Projetos Atuais', 'Status', 'Motivo Exclusão'];
      const csvRows = [headers.join(',')];
      
      filteredData.forEach(row => {
        const values = [
          new Date(row.createdAt).toLocaleDateString(),
          `"${row.name || ''}"`,
          `"${row.email || ''}"`,
          `"${row.birthday || ''}"`,
          `"${row.course || ''}"`,
          `"${row.period || ''}"`,
          `"${row.leagueRole || ''}"`,
          `"${row.weeklyHours || ''}"`,
          `"${row.roleFocus || ''}"`,
          `"${row.currentProjects || ''}"`,
          `"${row.status || 'Ativo'}"`,
          `"${row.deletionReason || ''}"`
        ];
        csvRows.push(values.join(','));
      });
      
      const csvData = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const csvUrl = URL.createObjectURL(csvData);
      const link = document.createElement('a');
      link.href = csvUrl;
      link.download = `laje_membros_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`;
      link.click();
      toast.success('CSV exportado com sucesso');
    } catch (err) {
      toast.error('Erro ao exportar CSV');
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text('Relatório de Membros LAJE HR', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 30);
      
      const tableData = filteredData.map(row => [
        row.name || '-',
        row.leagueRole || '-',
        row.currentProjects || '-',
        row.status || 'Ativo',
        `${row.progress || 0}%`
      ]);

      autoTable(doc, {
        head: [['Nome', 'Área', 'Projetos', 'Status', 'Progresso']],
        body: tableData,
        startY: 40,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] }
      });
      
      doc.save(`laje_relatorio_${new Date().toLocaleDateString().replace(/\//g, '-')}.pdf`);
      toast.success('PDF exportado com sucesso');
    } catch (err) {
      toast.error('Erro ao exportar PDF');
    }
  };

  const handleChangeStatus = async () => {
    if (!selectedMember) return;
    setIsUpdatingStatus(true);
    
    try {
      const newStatus = selectedMember.status === 'Ex-membro' ? 'Ativo' : 'Ex-membro';
      const updateData: any = { status: newStatus };
      
      if (newStatus === 'Ex-membro') {
        if (!deletionReason.trim()) {
          toast.error('Por favor, insira o motivo da exclusão');
          setIsUpdatingStatus(false);
          return;
        }
        updateData.deletionReason = deletionReason;
      } else {
        updateData.deletionReason = null;
      }
      
      await updateDoc(doc(db, 'responses', selectedMember.id), updateData);
      
      // Audit Log
      await logAuditAction({
        action: 'Alteração de Status',
        targetMemberId: selectedMember.id,
        targetMemberName: selectedMember.name || 'Membro',
        targetMemberEmail: selectedMember.email || '',
        details: `Status alterado de "${selectedMember.status || 'Ativo'}" para "${newStatus}"${newStatus === 'Ex-membro' && deletionReason ? `. Motivo informado: "${deletionReason}"` : ''}`,
        previousValue: JSON.stringify({ status: selectedMember.status || 'Ativo', deletionReason: selectedMember.deletionReason || null }),
        newValue: JSON.stringify({ status: newStatus, deletionReason: newStatus === 'Ex-membro' ? deletionReason : null }),
      });

      // Update local state
      setSelectedMember({ ...selectedMember, ...updateData });
      setData(data.map(m => m.id === selectedMember.id ? { ...m, ...updateData } : m));
      
      toast.success(`Membro marcado como ${newStatus}`);
      setIsEditStatusOpen(false);
      setDeletionReason('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'responses');
      toast.error('Erro ao atualizar status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!selectedMember || deleteConfirmation.trim().toUpperCase() !== 'EXCLUIR') return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'responses', selectedMember.id));

      // Audit Log
      await logAuditAction({
        action: 'Exclusão de Membro',
        targetMemberId: selectedMember.id,
        targetMemberName: selectedMember.name || 'Membro',
        targetMemberEmail: selectedMember.email || '',
        details: `Registro de "${selectedMember.name}" (${selectedMember.email}) foi excluído permanentemente da base de dados`,
        previousValue: JSON.stringify({ 
          name: selectedMember.name, 
          email: selectedMember.email, 
          role: selectedMember.leagueRole, 
          status: selectedMember.status 
        }),
      });

      setData(data.filter(member => member.id !== selectedMember.id));
      setSelectedMember(null);
      setIsDeleteConfirmOpen(false);
      setDeleteConfirmation('');
      toast.success('Registro excluído permanentemente');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'responses');
      toast.error('Erro ao excluir o registro');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8 pb-12">
      {/* Search & Filters Hub */}
      <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] p-4 sm:p-5 space-y-4 relative z-30 mb-2">
        {/* Header row: Title + Birthday Alert Notification Icon */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-[var(--color-ink-faint)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Filter size={16} />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm tracking-wide font-['Syne'] uppercase">
                Busca & Filtros de Membros
              </h3>
              <p className="text-[11px] text-gray-400 font-['Space_Mono']">
                Filtre por função atual, nome ou status de projeto diretamente na interface
              </p>
            </div>
          </div>

          {/* Small Alert Icon / Status in Dashboard Header */}
          <div className="relative flex items-center gap-3 shrink-0 self-end sm:self-auto">
            {activeTodayBirthdays.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAlertPopoverOpen(prev => !prev)}
                  className={`relative flex items-center gap-2.5 px-3.5 py-2.5 border transition-all cursor-pointer font-['Space_Mono'] text-xs select-none ${
                    isAlertPopoverOpen
                      ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/50 text-amber-300 hover:border-amber-400'
                  }`}
                  title="Alerta: aniversariante(s) de hoje! Clique para ver"
                >
                  {/* Pulsing Alert Indicator */}
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </span>
                  
                  <BellRing size={15} className="text-amber-400 animate-pulse" />
                  <span className="font-bold tracking-wider text-[11px]">
                    {activeTodayBirthdays.length} {activeTodayBirthdays.length === 1 ? 'Aniversário Hoje!' : 'Aniversários Hoje!'}
                  </span>
                </button>

                {/* Alert Popover Card */}
                {isAlertPopoverOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#161619] border border-amber-500/50 p-4 shadow-2xl shadow-black/80 z-50">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-3">
                      <div className="flex items-center gap-2 text-xs font-bold font-['Space_Mono'] text-amber-400 uppercase tracking-wider">
                        <Sparkles size={14} />
                        <span>Aniversários de Hoje ({realDay < 10 ? `0${realDay}` : realDay}/{realMonth < 10 ? `0${realMonth}` : realMonth})</span>
                      </div>
                      <button 
                        onClick={() => setIsAlertPopoverOpen(false)}
                        className="text-gray-400 hover:text-white p-1 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                      {activeTodayBirthdays.map(b => (
                        <div key={b.member.id} className="p-3 bg-gray-900/90 border border-gray-800 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h5 className="text-sm font-semibold text-white truncate">{b.member.name}</h5>
                            <p className="text-[11px] text-gray-400 truncate">{b.member.leagueRole || 'Membro'}</p>
                            {b.turningAge !== undefined && (
                              <p className="text-[11px] text-amber-300 font-semibold mt-0.5">
                                Completando {b.turningAge} anos hoje 🎂
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => handleCopyCongrats(b.member)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-[10px] font-['Space_Mono'] transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Copy size={11} /> Copiar
                            </button>
                            <button
                              onClick={() => {
                                setSelectedMember(b.member);
                                setIsAlertPopoverOpen(false);
                              }}
                              className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] font-medium transition-colors border border-gray-700 cursor-pointer"
                            >
                              Ver Perfil
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
                      <button
                        onClick={() => {
                          triggerBirthdayToast(activeTodayBirthdays);
                          setIsAlertPopoverOpen(false);
                        }}
                        className="text-xs text-amber-400 hover:text-amber-300 font-['Space_Mono'] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        🔔 Notificar via Toast
                      </button>
                      <button
                        onClick={() => {
                          setIsAlertPopoverOpen(false);
                          document.getElementById('aniversariantes-section')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="text-xs text-gray-400 hover:text-gray-200 underline cursor-pointer"
                      >
                        Ir para seção ↓
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 text-xs font-['Space_Mono'] text-gray-400 border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.02)]">
                <Cake size={14} className="text-gray-500" />
                <span className="text-[11px]">Sem aniversários hoje</span>
              </div>
            )}
          </div>
        </div>

        {/* Filter Inputs Grid: Nome, Função Atual, Status de Projeto, Situação */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Nome ou E-mail */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1.5 flex items-center gap-1.5">
              <Search size={12} className="text-emerald-400" />
              <span>Nome ou E-mail</span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: Clara, Lucas, @ufpe.br..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-gray-950/70 border border-[var(--color-ink-faint)] py-2.5 pl-3 pr-8 text-white font-['Space_Mono'] text-xs outline-none focus:border-[var(--color-accent)] transition-colors placeholder:text-gray-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  title="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* 2. Função Atual */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1.5 flex items-center gap-1.5">
              <Briefcase size={12} className="text-emerald-400" />
              <span>Função Atual</span>
            </label>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="w-full bg-gray-950/70 border border-[var(--color-ink-faint)] py-2.5 px-3 text-white font-['Space_Mono'] text-xs outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer truncate"
            >
              <option value="all" className="bg-gray-900 text-white">Todas as Funções ({data.length})</option>
              {distinctRoles.map(role => (
                <option key={role} value={role} className="bg-gray-900 text-white">
                  {role} ({countByRole(role)})
                </option>
              ))}
            </select>
          </div>

          {/* 3. Status de Projeto */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1.5 flex items-center gap-1.5">
              <Gamepad2 size={12} className="text-emerald-400" />
              <span>Status de Projeto</span>
            </label>
            <select
              value={projectStatusFilter}
              onChange={e => setProjectStatusFilter(e.target.value)}
              className="w-full bg-gray-950/70 border border-[var(--color-ink-faint)] py-2.5 px-3 text-white font-['Space_Mono'] text-xs outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer truncate"
            >
              <option value="all" className="bg-gray-900 text-white">Todos os Status ({data.length})</option>
              <option value="in_project" className="bg-gray-900 text-white">
                🎮 Em Projeto Ativo ({countByProjectStatus.in_project})
              </option>
              <option value="waiting_invite" className="bg-gray-900 text-white">
                ⏳ Aguardando / Quer Entrar ({countByProjectStatus.waiting_invite})
              </option>
              <option value="observing" className="bg-gray-900 text-white">
                🔍 Observando / Acompanhando ({countByProjectStatus.observing})
              </option>
              <option value="no_project" className="bg-gray-900 text-white">
                ⚪ Sem Projeto / Disponível ({countByProjectStatus.no_project})
              </option>
              {distinctProjects.length > 0 && (
                <optgroup label="Projetos Específicos" className="bg-gray-900 text-emerald-400">
                  {distinctProjects.map(proj => {
                    const count = data.filter(m => (m.currentProjects || '').toLowerCase().includes(proj.toLowerCase())).length;
                    return (
                      <option key={proj} value={`project:${proj}`} className="bg-gray-900 text-white">
                        📁 {proj} ({count})
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>

          {/* 4. Situação Cadastral + Botão Limpar */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1.5 flex items-center gap-1.5">
              <Users size={12} className="text-emerald-400" />
              <span>Situação do Membro</span>
            </label>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="flex-1 bg-gray-950/70 border border-[var(--color-ink-faint)] py-2.5 px-3 text-white font-['Space_Mono'] text-xs outline-none focus:border-[var(--color-accent)] transition-colors cursor-pointer"
              >
                <option value="all" className="bg-gray-900 text-white">Todos ({data.length})</option>
                <option value="active" className="bg-gray-900 text-white">Ativos ({data.filter(m => m.status !== 'Ex-membro').length})</option>
                <option value="former" className="bg-gray-900 text-white">Ex-membros ({data.filter(m => m.status === 'Ex-membro').length})</option>
              </select>
              {isFilterActive && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-['Space_Mono'] font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  title="Limpar todos os filtros"
                >
                  <RotateCcw size={13} />
                  <span className="hidden sm:inline">Limpar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Filter Chips */}
        <div className="pt-2 border-t border-gray-800/60 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-['Space_Mono']">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mr-1 flex items-center gap-1">
            <SlidersHorizontal size={11} /> Atalhos:
          </span>
          <button
            type="button"
            onClick={handleClearFilters}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              !isFilterActive
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            Todos
          </button>
          <button
            type="button"
            onClick={() => setProjectStatusFilter(projectStatusFilter === 'in_project' ? 'all' : 'in_project')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              projectStatusFilter === 'in_project'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🎮 Em Projeto
          </button>
          <button
            type="button"
            onClick={() => setProjectStatusFilter(projectStatusFilter === 'waiting_invite' ? 'all' : 'waiting_invite')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              projectStatusFilter === 'waiting_invite'
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            ⏳ Quer Entrar
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter(roleFilter === 'Programação' ? 'all' : 'Programação')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              roleFilter === 'Programação'
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            💻 Programação
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter(roleFilter.toLowerCase().includes('arte') ? 'all' : 'Arte')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              roleFilter.toLowerCase().includes('arte')
                ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🎨 Arte
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter(roleFilter.toLowerCase().includes('game design') ? 'all' : 'Game Design')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              roleFilter.toLowerCase().includes('game design')
                ? 'bg-pink-500/20 border-pink-500 text-pink-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🕹️ Game Design
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter(roleFilter.toLowerCase().includes('som') || roleFilter.toLowerCase().includes('áudio') ? 'all' : 'Som')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              roleFilter.toLowerCase().includes('som') || roleFilter.toLowerCase().includes('áudio')
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            🎵 Som / Áudio
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'former' ? 'all' : 'former')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              statusFilter === 'former'
                ? 'bg-red-500/20 border-red-500 text-red-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            📋 Ex-membros
          </button>
        </div>

        {/* Results Counter and Active Filter Tags */}
        <div className="pt-2.5 border-t border-gray-800/40 flex flex-wrap items-center justify-between gap-3 text-xs font-['Space_Mono']">
          <div className="flex items-center gap-2 text-gray-400 text-[11px]">
            <span>Exibindo</span>
            <span className="font-bold text-white px-2 py-0.5 bg-gray-900 border border-gray-700 text-emerald-400">
              {filteredData.length}
            </span>
            <span>de {data.length} membros</span>
            {isFilterActive && (
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                Filtros Ativos
              </span>
            )}
          </div>

          {/* Active filter badges */}
          {isFilterActive && (
            <div className="flex flex-wrap items-center gap-1.5">
              {searchQuery && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-200 text-[10px]">
                  Busca: "{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="hover:text-red-400 p-0.5 cursor-pointer">
                    <X size={10} />
                  </button>
                </span>
              )}
              {roleFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-200 text-[10px]">
                  Função: {roleFilter}
                  <button onClick={() => setRoleFilter('all')} className="hover:text-red-400 p-0.5 cursor-pointer">
                    <X size={10} />
                  </button>
                </span>
              )}
              {projectStatusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-200 text-[10px]">
                  Projeto: {
                    projectStatusFilter === 'in_project' ? 'Em Projeto' :
                    projectStatusFilter === 'waiting_invite' ? 'Aguardando' :
                    projectStatusFilter === 'observing' ? 'Observando' :
                    projectStatusFilter === 'no_project' ? 'Sem Projeto' :
                    projectStatusFilter.replace('project:', '')
                  }
                  <button onClick={() => setProjectStatusFilter('all')} className="hover:text-red-400 p-0.5 cursor-pointer">
                    <X size={10} />
                  </button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-800 border border-gray-700 text-gray-200 text-[10px]">
                  Situação: {statusFilter === 'active' ? 'Ativos' : 'Ex-membros'}
                  <button onClick={() => setStatusFilter('all')} className="hover:text-red-400 p-0.5 cursor-pointer">
                    <X size={10} />
                  </button>
                </span>
              )}
              <button
                onClick={handleClearFilters}
                className="text-[10px] text-red-400 hover:text-red-300 underline ml-1 cursor-pointer font-semibold"
              >
                Limpar todos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Alerta Visual de Destaque no Topo do Dashboard */}
      {activeTodayBirthdays.length > 0 && (
        <div className="p-4 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-[0_0_25px_rgba(245,158,11,0.15)] relative overflow-hidden">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-xl shrink-0 animate-bounce">
              🎂
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500 text-gray-950 text-[10px] font-bold uppercase font-['Space_Mono'] tracking-wider">
                  <Sparkles size={11} /> Alerta de Aniversário
                </span>
                <span className="text-[11px] text-amber-300 font-['Space_Mono'] font-bold">
                  Hoje, {realDay < 10 ? `0${realDay}` : realDay}/{realMonth < 10 ? `0${realMonth}` : realMonth}
                </span>
              </div>
              <p className="text-white font-semibold text-sm">
                {activeTodayBirthdays.map(b => b.member.name).join(', ')} {activeTodayBirthdays.length === 1 ? 'está comemorando aniversário hoje!' : 'estão comemorando aniversário hoje!'}
                {activeTodayBirthdays.length === 1 && activeTodayBirthdays[0].turningAge !== undefined ? ` (${activeTodayBirthdays[0].turningAge} anos 🎉)` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-stretch md:self-auto justify-end shrink-0">
            {activeTodayBirthdays.length === 1 && (
              <button
                onClick={() => handleCopyCongrats(activeTodayBirthdays[0].member)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
              >
                <Copy size={13} />
                Copiar Mensagem
              </button>
            )}
            <button
              onClick={() => {
                document.getElementById('aniversariantes-section')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-['Space_Mono'] transition-colors border border-gray-700 cursor-pointer"
            >
              <Cake size={13} />
              Ver Aniversariantes do Mês
            </button>
          </div>
        </div>
      )}

      {/* Chart Top */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]  ">
          <h3 className="text-white font-semibold mb-6">Membros por Categoria</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#1f2937' }}
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '0.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#10b981', fontWeight: 600 }}
                />
                <Bar dataKey="Membros" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#10b981" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]   flex flex-col justify-between">
          <div>
            <h3 className="text-white font-semibold mb-6">Resumo Estatístico</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-[var(--color-ink-faint)]">
                <span className="text-gray-400 font-medium">Total de Cadastros</span>
                <span className="text-white font-bold text-xl">{totalCount}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-[var(--color-ink-faint)]">
                <span className="text-gray-400 font-medium">Projetos Ativos</span>
                <span className="text-emerald-400 font-bold text-xl">{totalActiveProjects}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-6">
            <button 
              onClick={handleExportPDF}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium  transition-colors border border-gray-700"
            >
              <FileText size={16} />
              Exportar para PDF
            </button>
            <button 
              onClick={handleExportCSV}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-medium  transition-colors border border-gray-700"
            >
              <Download size={16} />
              Exportar para CSV
            </button>
            {onNavigateTab && (
              <button 
                onClick={() => onNavigateTab('logs')}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold font-['Space_Mono'] transition-colors border border-emerald-500/30 cursor-pointer"
              >
                <History size={15} />
                Log de Alterações (Auditoria)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]   flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Membros Ativos</p>
            <p className="text-3xl font-bold text-white">{activeCount}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 ">
            <Users size={28} />
          </div>
        </div>
        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]   flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Foco Médio (Liga)</p>
            <p className="text-3xl font-bold text-white">{avgLeagueFocus} <span className="text-sm text-gray-500 font-medium">/ 5</span></p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 ">
            <Target size={28} />
          </div>
        </div>
        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]   flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Progresso Médio</p>
            <p className="text-3xl font-bold text-white">{avgProgress}%</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500 ">
            <Activity size={28} />
          </div>
        </div>
      </div>

      {/* Radar de Gestão de Projetos & Inversão do Convite */}
      <section className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-ink-faint)] mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Gamepad2 size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold text-lg font-['Syne']">
                  Alocação de Membros & Gestão de Projetos
                </h3>
              </div>
              <p className="text-xs text-gray-400 font-['Space_Mono'] mt-0.5">
                Métricas centrais de acompanhamento da diretoria
              </p>
            </div>
          </div>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('projects')}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Gamepad2 size={14} />
              Acessar Catálogo & Vagas →
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Inversão do Convite */}
          <div className="p-4 bg-gray-900/60 border border-gray-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold font-['Space_Mono'] text-amber-400 uppercase tracking-wider block mb-1">
                Inversão do Convite
              </span>
              <p className="text-sm font-bold text-white mb-2">
                Membros em Produção vs. Disponíveis
              </p>
              <div className="space-y-1.5 text-xs text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-400">Em projetos ativos:</span>
                  <strong className="text-emerald-400 font-['Space_Mono']">{membersInProjects.length} membros</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Esperando convite:</span>
                  <strong className="text-amber-300 font-['Space_Mono']">{membersWaitingInvite.length} membros</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Apenas acompanham:</span>
                  <strong className="text-gray-400 font-['Space_Mono']">{membersObserving.length} membros</strong>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-800">
              Cruze vagas abertas com as preferências de quem quer entrar.
            </p>
          </div>

          {/* Card 2: Rituais Quinzenais */}
          <div className="p-4 bg-gray-900/60 border border-gray-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold font-['Space_Mono'] text-emerald-400 uppercase tracking-wider block mb-1">
                Rituais de Gestão
              </span>
              <p className="text-sm font-bold text-white mb-2">
                Check-ins & Janelas de Entrada
              </p>
              <div className="space-y-1.5 text-xs text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-400">Check-in de projeto:</span>
                  <span className="text-gray-200 font-['Space_Mono']">15 min / 2 semanas</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Reunião de diretoria:</span>
                  <span className="text-gray-200 font-['Space_Mono']">Alternada c/ check-ins</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Janela de entrada:</span>
                  <span className="text-emerald-400 font-['Space_Mono']">2 prim. semanas sem.</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 pt-2 border-t border-gray-800">
              Check-in em dia evita projetos em risco sem sobrecarregar ninguém.
            </p>
          </div>

          {/* Card 3: Portas de Entrada */}
          <div className="p-4 bg-gray-900/60 border border-gray-800 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold font-['Space_Mono'] text-purple-400 uppercase tracking-wider block mb-1">
                Portas de Entrada
              </span>
              <p className="text-sm font-bold text-white mb-2">
                Vagas, Mural & Propostas
              </p>
              <div className="space-y-1.5 text-xs text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-400">Vagas de projetos:</span>
                  <span className="text-amber-300 font-['Space_Mono']">Compromisso semestral</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Mural de tarefas:</span>
                  <span className="text-emerald-300 font-['Space_Mono']">Entrada livre sem reunião</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Propor novo jogo:</span>
                  <span className="text-purple-300 font-['Space_Mono']">Formulário leve (10 min)</span>
                </div>
              </div>
            </div>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('projects')}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-['Space_Mono'] font-bold mt-3 pt-2 border-t border-gray-800 text-left flex items-center justify-between cursor-pointer"
              >
                <span>Ver Vagas e Mural</span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Seção Visual: Aniversariantes do Mês */}
      <section id="aniversariantes-section" className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden scroll-mt-6">
        {/* Subtle accent corner glow */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--color-ink-faint)] mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Cake size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-white font-semibold text-lg tracking-tight font-['Syne']">
                  Aniversariantes do Mês
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-bold font-['Space_Mono'] bg-amber-500/15 border border-amber-500/30 text-amber-300">
                  {monthBirthdays.length} {monthBirthdays.length === 1 ? 'membro' : 'membros'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Comemorações de <strong className="text-gray-200 capitalize">{viewMonthName} de {viewYear}</strong> baseadas nos perfis cadastrados
              </p>
            </div>
          </div>

          {/* Month selector controls */}
          <div className="flex items-center gap-1.5 self-start sm:self-center">
            <button
              onClick={() => setViewMonthDate(new Date(viewYear, viewMonthDate.getMonth() - 1, 1))}
              className="p-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors cursor-pointer"
              title="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setViewMonthDate(new Date())}
              disabled={isCurrentCalendarMonth}
              className={`px-3 py-1.5 text-xs font-semibold font-['Space_Mono'] border transition-colors ${
                isCurrentCalendarMonth 
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 cursor-default' 
                  : 'bg-gray-800/80 hover:bg-gray-700 border-gray-700 text-gray-300 cursor-pointer'
              }`}
            >
              {isCurrentCalendarMonth ? 'Mês Atual' : 'Voltar ao Atual'}
            </button>
            <button
              onClick={() => setViewMonthDate(new Date(viewYear, viewMonthDate.getMonth() + 1, 1))}
              className="p-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors cursor-pointer"
              title="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Highlight Banner if there are birthdays TODAY */}
        {todayBirthdays.length > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-xl shrink-0 animate-bounce">
                🎂
              </div>
              <div>
                <p className="text-xs uppercase font-bold text-amber-400 tracking-wider font-['Space_Mono'] flex items-center gap-1.5">
                  <Sparkles size={14} /> Aniversariante de Hoje!
                </p>
                <p className="text-white font-semibold text-sm">
                  {todayBirthdays.map(b => b.member.name).join(', ')} {todayBirthdays.length === 1 ? 'está fazendo aniversário hoje!' : 'estão fazendo aniversário hoje!'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
              {todayBirthdays.map(b => (
                <button
                  key={b.member.id}
                  onClick={() => handleCopyCongrats(b.member)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                >
                  <Copy size={13} />
                  Copiar Parabéns
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Birthday Cards Grid or Empty State */}
        {monthBirthdays.length === 0 ? (
          <div className="text-center py-10 px-4 border border-dashed border-[var(--color-ink-faint)] bg-black/20">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-800/60 border border-gray-700/60 flex items-center justify-center text-gray-400">
              <Gift size={22} className="opacity-60" />
            </div>
            <h4 className="text-sm font-semibold text-gray-300 font-['Syne']">
              Nenhum aniversariante em {viewMonthName}
            </h4>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              Nenhum membro ativo possui aniversário registrado neste mês. À medida que novos membros preencherem suas datas de nascimento no formulário, elas serão exibidas aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {monthBirthdays.map(b => {
              const { member } = b;
              return (
                <div
                  key={member.id}
                  className={`p-4 border transition-all duration-200 relative group flex flex-col justify-between ${
                    b.isToday
                      ? 'bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.15)]'
                      : 'bg-gray-800/40 hover:bg-gray-800/80 border-gray-700/60 hover:border-gray-600'
                  }`}
                >
                  <div>
                    {/* Top Row: Avatar + Date Badge */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border relative ${
                            b.isToday
                              ? 'bg-amber-500/20 text-amber-300 border-amber-400'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}
                        >
                          {member.name ? member.name.slice(0, 2).toUpperCase() : 'MB'}
                          {b.isToday && (
                            <span className="absolute -top-1 -right-1 text-xs">🎉</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4
                            onClick={() => setSelectedMember(member)}
                            className="font-semibold text-sm text-white group-hover:text-emerald-400 transition-colors truncate cursor-pointer"
                            title={member.name}
                          >
                            {member.name}
                          </h4>
                          <p className="text-[11px] text-gray-400 truncate" title={member.leagueRole || 'Membro'}>
                            {member.leagueRole || 'Membro'}
                          </p>
                        </div>
                      </div>

                      {/* Day Pill */}
                      <div className="shrink-0 text-right">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-900 border border-gray-700 text-xs font-['Space_Mono'] font-bold text-gray-200">
                          <Cake size={11} className="text-amber-400" />
                          Dia {b.day}
                        </span>
                      </div>
                    </div>

                    {/* Meta info: Turning Age & Status */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-700/50 text-xs">
                      <span className="text-gray-400">
                        {b.turningAge !== undefined ? (
                          b.isToday ? (
                            <strong className="text-amber-300 font-semibold">{b.turningAge} anos hoje!</strong>
                          ) : (
                            <span>Completa <strong className="text-gray-200">{b.turningAge} anos</strong></span>
                          )
                        ) : (
                          <span>{b.formattedBirthday}</span>
                        )}
                      </span>

                      {/* Status indicator */}
                      {b.isToday ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 font-['Space_Mono'] animate-pulse">
                          Hoje! 🎂
                        </span>
                      ) : b.daysUntil !== null && b.daysUntil === 1 ? (
                        <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-['Space_Mono']">
                          Amanhã!
                        </span>
                      ) : b.daysUntil !== null && b.daysUntil > 1 ? (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-['Space_Mono']">
                          Em {b.daysUntil} dias
                        </span>
                      ) : b.daysUntil !== null && b.daysUntil < 0 ? (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-800 text-gray-500 border border-gray-700 font-['Space_Mono']">
                          Comemorado
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="mt-3 pt-3 border-t border-gray-700/40 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedMember(member)}
                      className="text-[11px] text-gray-400 hover:text-emerald-400 transition-colors font-medium cursor-pointer"
                    >
                      Ver Perfil →
                    </button>
                    <div className="flex items-center gap-1.5">
                      {member.email && (
                        <a
                          href={`mailto:${member.email}?subject=Feliz%20Anivers%C3%A1rio!&body=Ol%C3%A1%20${encodeURIComponent(member.name)},%20desejamos%20um%20feliz%20anivers%C3%A1rio%20e%20muito%20sucesso%20na%20LAJE!`}
                          className="p-1.5 text-gray-400 hover:text-amber-400 hover:bg-gray-700/50 rounded transition-colors"
                          title={`Enviar e-mail para ${member.email}`}
                        >
                          <Mail size={13} />
                        </a>
                      )}
                      <button
                        onClick={() => handleCopyCongrats(member)}
                        className="p-1.5 text-gray-400 hover:text-emerald-400 hover:bg-gray-700/50 rounded transition-colors cursor-pointer"
                        title="Copiar mensagem de parabéns"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8">
        {/* Latest Responses */}
        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-semibold">Transmissões Recentes</h3>
            {isFilterActive && (
              <span className="text-[11px] font-['Space_Mono'] text-amber-400 bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">
                Filtros ativos ({filteredData.length})
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
            {filteredData.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-gray-400 text-sm">Nenhum dado encontrado com os filtros atuais.</p>
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline font-['Space_Mono'] cursor-pointer"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              [...filteredData].sort((a, b) => b.createdAt - a.createdAt).map(response => (
                <div key={response.id} onClick={() => setSelectedMember(response)} className="p-4 bg-gray-800/50 border border-gray-700/50 flex justify-between items-center cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/20 hover:border-emerald-500/50 hover:bg-gray-800 transition-all duration-300 group">
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">{response.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      <span className="font-medium text-emerald-500">{response.leagueRole}</span> • {response.currentProjects || 'Sem projeto'}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${response.progress}%` }} />
                      </div>
                      <p className="text-xs font-bold text-gray-300">{response.progress}%</p>
                    </div>
                    <p className="text-[10px] text-gray-500 font-medium">{new Date(response.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Full Data Table */}
      <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-white font-semibold">Registro de Atualizações (RH)</h3>
              <span className="px-2 py-0.5 bg-gray-900 border border-gray-700 text-[11px] font-['Space_Mono'] text-emerald-400 font-bold">
                {filteredData.length} {filteredData.length === 1 ? 'membro' : 'membros'}
              </span>
              {isFilterActive && (
                <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-['Space_Mono'] font-semibold">
                  Filtrado
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">Clique em um membro para detalhes e histórico</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isFilterActive && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-['Space_Mono'] font-semibold transition-colors cursor-pointer"
                title="Limpar todos os filtros da tabela"
              >
                <RotateCcw size={12} />
                Limpar Filtros
              </button>
            )}
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('logs')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer"
              >
                <History size={13} />
                Trilha de Auditoria →
              </button>
            )}
          </div>
        </div>
        <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          <table className="w-full text-left text-xs text-gray-300">
            <thead className="text-xs text-gray-400 uppercase bg-gray-950 border-b border-[var(--color-ink-faint)]">
              <tr>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Data</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Membro</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Status</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Curso/Período</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Área/Papel</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Projetos</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Progresso</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Prioridade</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Solicitação de Edição</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Data de Alteração</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.sort((a, b) => b.createdAt - a.createdAt).map(response => (
                <tr key={response.id} onClick={() => setSelectedMember(response)} className="border-b border-[var(--color-ink-faint)] cursor-pointer hover:bg-gray-800/80 hover:scale-[1.01] z-0 hover:z-10 relative hover:shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-300 group">
                  <td className="px-2 py-3 text-gray-400 text-xs">{new Date(response.createdAt).toLocaleDateString()}</td>
                  <td className="px-2 py-3">
                    <div className="font-semibold text-gray-200 group-hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                      <span>{response.name}</span>
                      {response.birthday && (
                        <span 
                          className="text-[11px] leading-none inline-flex items-center cursor-help" 
                          title={`Data de Aniversário: ${response.birthday}`}
                        >
                          🎂
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-emerald-500/80">{response.email}</div>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-block whitespace-nowrap text-center min-w-[75px] px-2 py-1 text-xs font-medium ${response.status === 'Ex-membro' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {response.status || 'Ativo'}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="text-gray-300">{response.course}</div>
                    <div className="text-xs text-gray-500">{response.period}</div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {String(response.leagueRole || '-').split(',').map((r: string) => (
                        <span key={r.trim()} className="px-2 py-0.5 text-[11px] font-medium bg-gray-800 text-gray-300 rounded-sm whitespace-nowrap">
                          {r.trim()}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-3 max-w-[150px] truncate text-gray-300" title={response.currentProjects}>{response.currentProjects || '-'}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-200 font-bold min-w-[3ch] text-xs">{response.progress}%</span>
                      <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${response.progress}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-xs">
                    <div className="flex justify-between w-16 mb-1 text-gray-400">Liga: <span className="font-semibold text-gray-200">{response.leagueFocus}</span></div>
                    <div className="flex justify-between w-16 text-gray-400">Facul: <span className="font-semibold text-gray-200">{response.collegeFocus}</span></div>
                  </td>
                  <td className="px-2 py-3">
                     <span className={`px-2.5 py-1 text-xs font-medium ${
                      response.priority === 'Alta' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                      response.priority === 'Baixa' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                     }`}>
                       {response.priority}
                     </span>
                  </td>
                  <td className="px-2 py-3 text-center">
                    {response.editRequestStatus === 'pending' && <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-2 py-1 text-[10px] font-bold uppercase font-['Space_Mono']">Pendente</span>}
                    {response.editRequestStatus === 'rejected' && <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-1 text-[10px] font-bold uppercase font-['Space_Mono']">Recusado</span>}
                    {!response.editRequestStatus && response.editAuthorized && <span className="bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20 px-2 py-1 text-[10px] font-bold uppercase font-['Space_Mono']">Aprovado</span>}
                  </td>
                  <td className="px-2 py-3 text-center text-xs text-gray-400">
                    {response.lastEditedAt ? new Date(response.lastEditedAt).toLocaleDateString('pt-BR') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm border-t border-gray-100">
              Nenhum dado registrado no servidor.
            </div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-12 px-4 border-t border-gray-800 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-gray-800/80 border border-gray-700 flex items-center justify-center text-gray-400">
                <Search size={20} className="opacity-60" />
              </div>
              <h4 className="text-sm font-bold text-white font-['Syne']">
                Nenhum membro encontrado com os filtros selecionados
              </h4>
              <p className="text-xs text-gray-400 max-w-md mx-auto font-['Space_Mono']">
                Nenhum registro corresponde aos critérios atuais (Nome: "{searchQuery || 'qualquer'}", Função: "{roleFilter === 'all' ? 'todas' : roleFilter}", Projeto: "{projectStatusFilter === 'all' ? 'todos' : projectStatusFilter}").
              </p>
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-['Space_Mono'] font-bold text-xs transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                Limpar Filtros e Ver Todos ({data.length})
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedMember(null)}>
          <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] w-full max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700  shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-[rgba(255,255,255,0.02)]/90 backdrop-blur-md border-b border-[var(--color-ink-faint)] p-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                  {selectedMember.name}
                  {selectedMember.status === 'Ex-membro' && (
                    <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-500 border border-red-500/20  font-medium uppercase tracking-wider">Ex-membro</span>
                  )}
                </h2>
                <p className="text-sm text-emerald-500/80 font-medium">{selectedMember.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setIsEditStatusOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium  transition-colors">
                  <Edit2 size={14} />
                  Alterar Status
                </button>
                <button
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-medium transition-colors"
                >
                  <Trash2 size={14} />
                  Excluir Registro
                </button>
                <button onClick={() => setSelectedMember(null)} className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                {selectedMember.status === 'Ex-membro' && selectedMember.deletionReason && (
                  <div>
                    <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">Motivo da Exclusão</h4>
                    <div className="bg-red-500/5 border border-red-500/10 p-4  text-sm">
                      <p className="text-gray-300 font-medium">"{selectedMember.deletionReason}"</p>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Informações Pessoais & Acadêmicas</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4 text-sm space-y-3">
                    {selectedMember.birthday && (
                      <p>
                        <span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Data de Aniversário</span>
                        <span className="text-amber-300 font-semibold flex items-center gap-1.5">
                          <span>🎂</span>
                          {(() => {
                            try {
                              const [y, m, d] = String(selectedMember.birthday).split('-');
                              if (y && m && d) return `${d}/${m}/${y}`;
                              return selectedMember.birthday;
                            } catch {
                              return selectedMember.birthday;
                            }
                          })()}
                        </span>
                      </p>
                    )}
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Curso</span> <span className="text-gray-200 font-medium">{selectedMember.course || 'Não informado'}</span></p>
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Período</span> <span className="text-gray-200 font-medium">{selectedMember.period || 'Não informado'}</span></p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Engajamento na LAJE</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm space-y-4">
                    <div>
                      <span className="text-gray-400 block text-xs font-semibold uppercase mb-1.5">Função Atual / Área(s)</span>
                      <div className="flex flex-wrap gap-1.5">
                        {String(selectedMember.leagueRole || 'Não informado').split(',').map((r: string) => (
                          <span key={r.trim()} className="inline-block px-2.5 py-1 bg-[rgba(255,255,255,0.04)] border border-gray-700 text-emerald-400 text-xs font-semibold rounded-sm">
                            {r.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                    {selectedMember.weeklyHours && (
                      <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Dedicação Semanal</span> <span className="text-emerald-400 font-semibold">{selectedMember.weeklyHours}</span></p>
                    )}
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Projetos Atuais</span> <span className="text-gray-200 font-medium">{selectedMember.currentProjects || 'Nenhum'}</span></p>
                    <p><span className="text-gray-400 block text-xs font-semibold uppercase mb-1">Projetos de Interesse</span> <span className="text-gray-200 font-medium">{selectedMember.interestedProjects || 'Nenhum'}</span></p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Métricas de Foco (1-5)</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-700 pb-3">
                      <span className="text-gray-400 font-medium">Dedicação à LAJE</span>
                      <span className="text-emerald-400 font-bold text-lg">{selectedMember.leagueFocus} <span className="text-gray-500 text-xs font-medium">/ 5</span></span>
                    </div>
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-gray-400 font-medium">Dedicação à Faculdade</span>
                      <span className="text-emerald-400 font-bold text-lg">{selectedMember.collegeFocus} <span className="text-gray-500 text-xs font-medium">/ 5</span></span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Status do Trabalho</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm space-y-5">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400 text-xs font-semibold uppercase">Progresso Atual</span>
                        <span className="text-emerald-400 font-bold">{selectedMember.progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${selectedMember.progress}%` }} />
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-3 border-t border-gray-700">
                      <span className="text-gray-400 text-xs font-semibold uppercase">Prioridade</span>
                      <span className={`px-2.5 py-1 text-xs font-bold  ${
                        selectedMember.priority === 'Alta' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                        selectedMember.priority === 'Baixa' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                      }`}>
                        {selectedMember.priority}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-gray-700">
                      <span className="text-gray-400 text-xs font-semibold uppercase block mb-1">Deadline Final</span> 
                      <span className="text-gray-200 font-medium">{selectedMember.deadline ? new Date(selectedMember.deadline).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Não definido'}</span>
                    </div>
                  </div>
                </div>

                {selectedMember.roleFocus && (
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Foco na Função Atual</h4>
                    <div className="bg-gray-800 border border-gray-700 p-4 text-sm min-h-[60px]">
                      <p className="text-gray-300 leading-relaxed italic font-medium">
                        "{selectedMember.roleFocus}"
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Foco de Aprendizado</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4  text-sm min-h-[100px]">
                    <p className="text-gray-300 leading-relaxed italic font-medium">
                      "{selectedMember.learningFocus || 'Nenhum foco específico relatado.'}"
                    </p>
                  </div>
                </div>
                
                <div className="pt-4 flex flex-col gap-2 border-t border-[var(--color-ink-faint)]">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Timestamp do Registro</h4>
                    <p className="text-[10px] text-gray-500 font-medium">{new Date(selectedMember.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                  {selectedMember.lastEditedAt && (
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Última Edição</h4>
                      <p className="text-[10px] text-gray-500 font-medium">{new Date(selectedMember.lastEditedAt).toLocaleString('pt-BR')}</p>
                    </div>
                  )}
                  {selectedMember.editRequestStatus === 'pending' && (
                    <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 flex flex-col items-start gap-3">
                      <p className="text-xs text-yellow-500 font-bold uppercase tracking-wider font-['Space_Mono']">Solicitação de Edição Pendente</p>
                      <div className="flex gap-3 w-full">
                        <button
                          onClick={() => handleAuthorizeEdit(selectedMember, true)}
                          className="px-4 py-2 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] font-bold text-[0.65rem] uppercase tracking-[0.1em] transition-colors flex-1 cursor-pointer border-none font-['Space_Mono']"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleAuthorizeEdit(selectedMember, false)}
                          className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold text-[0.65rem] uppercase tracking-[0.1em] border border-red-500/20 transition-colors flex-1 cursor-pointer font-['Space_Mono']"
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  )}
                  {selectedMember.editHistory && selectedMember.editHistory.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-ink-faint)]">
                      <h4 className="text-[10px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider mb-3">Histórico de Solicitações</h4>
                      <ul className="space-y-2">
                        {selectedMember.editHistory.map((item: any, idx: number) => (
                          <li key={idx} className="flex justify-between items-center text-[10px] text-[var(--color-ink)] font-medium font-['Space_Mono'] bg-[rgba(255,255,255,0.02)] p-2 border border-[var(--color-ink-faint)]">
                            <span className={item.action === 'Aprovado' ? 'text-[var(--color-accent)]' : 'text-red-400'}>{item.action || 'Aprovado'}</span>
                            <span className="text-[var(--color-ink-muted)]">{new Date(item.timestamp || item).toLocaleString('pt-BR')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {isEditStatusOpen && selectedMember && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setIsEditStatusOpen(false)}>
          <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] w-full max-w-md  shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                Alterar Status do Membro
              </h3>
              <button onClick={() => setIsEditStatusOpen(false)} className="text-gray-500 hover:text-gray-300">
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-gray-400 mb-6">
              Membro atual: <strong className="text-emerald-400">{selectedMember.name}</strong><br/>
              Status atual: <strong className="text-white">{selectedMember.status || 'Ativo'}</strong>
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-gray-800/50  border border-gray-700/50">
                <p className="text-sm text-gray-300 mb-2">Novo Status será:</p>
                <p className={`text-lg font-bold ${selectedMember.status === 'Ex-membro' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {selectedMember.status === 'Ex-membro' ? 'Ativo' : 'Ex-membro'}
                </p>
              </div>

              {selectedMember.status !== 'Ex-membro' && (
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500 mb-1 block">Motivo da Exclusão</label>
                  <textarea 
                    required 
                    rows={3}
                    value={deletionReason} 
                    onChange={e => setDeletionReason(e.target.value)}
                    placeholder="Descreva o motivo (ex: desligamento, formatura, inatividade)..."
                    className="w-full bg-gray-950 border border-[var(--color-ink-faint)] focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white p-2.5  outline-none transition-all resize-none" 
                  />
                </div>
              )}

              <div className="pt-2 flex gap-3">
                <button 
                  onClick={() => setIsEditStatusOpen(false)}
                  className="flex-1 px-4 py-3 bg-gray-800 text-white font-bold  hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleChangeStatus}
                  disabled={isUpdatingStatus || (selectedMember.status !== 'Ex-membro' && !deletionReason.trim())}
                  className={`flex-1 flex items-center justify-center gap-2 font-bold  px-4 py-3 transition-colors disabled:opacity-50 ${
                    selectedMember.status === 'Ex-membro' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {isUpdatingStatus ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar Alteração'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && selectedMember && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setIsDeleteConfirmOpen(false)}>
          <div className="bg-gray-950 border border-red-500/40 w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 text-red-400">
              <Trash2 size={22} />
              <h3 className="text-lg font-bold">Excluir registro permanentemente?</h3>
            </div>
            <p className="text-sm text-gray-300 mb-5">
              O registro de <strong className="text-white">{selectedMember.name}</strong> será removido do Registro de Atualizações (RH) e não poderá ser recuperado.
            </p>
            <label className="text-xs font-semibold uppercase text-gray-500 mb-1 block">
              Digite EXCLUIR para confirmar
            </label>
            <input
              value={deleteConfirmation}
              onChange={e => setDeleteConfirmation(e.target.value)}
              autoFocus
              className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 text-white p-3 outline-none transition-colors"
            />
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setIsDeleteConfirmOpen(false);
                  setDeleteConfirmation('');
                }}
                className="flex-1 px-4 py-3 bg-gray-800 text-white font-bold hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteMember}
                disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== 'EXCLUIR'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold disabled:opacity-50 transition-colors"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
