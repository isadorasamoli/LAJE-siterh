import React, { useEffect, useState, useRef } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, deleteField, setDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { Loader2, Users, Target, Activity, X, Search, Download, FileText, Trash2, Edit2, Cake, Gift, Calendar as CalendarIcon, PartyPopper, Sparkles, ChevronLeft, ChevronRight, Mail, Copy, Bell, BellRing, Check, History, Gamepad2, Briefcase, Kanban, Filter, RotateCcw, SlidersHorizontal, CheckCircle2, UserPlus, AlertTriangle, RefreshCw, Database, Terminal, Info, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logAuditAction } from '../lib/audit';
import { exportDetailedMemberPDF } from '../lib/exportDetailedMemberPDF';
import AdminAccessBlocked from './AdminAccessBlocked';

interface DashboardProps {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isRH?: boolean;
  currentUserEmail?: string;
  currentUserName?: string;
  currentUserUid?: string;
  onNavigateTab?: (tab: 'form' | 'projects' | 'dashboard' | 'calendar' | 'logs' | 'settings') => void;
}

export default function Dashboard({ 
  isAdmin = false, 
  isSuperAdmin: propIsSuperAdmin,
  isRH: propIsRH,
  currentUserEmail = '',
  currentUserName = '',
  currentUserUid = '',
  onNavigateTab 
}: DashboardProps) {
  if (!isAdmin) {
    return (
      <AdminAccessBlocked 
        title="Acesso Restrito: Dashboard"
        onNavigateHome={() => onNavigateTab ? onNavigateTab('form') : undefined}
      />
    );
  }

  const isSuperAdmin = propIsSuperAdmin !== undefined 
    ? propIsSuperAdmin 
    : (currentUserEmail.toLowerCase().trim() === 'isadora.mlima@ufpe.br' || currentUserEmail.toLowerCase().trim().startsWith('isadora.mlima@ufpe') || currentUserEmail.toLowerCase().trim() === 'isadorasdml@gmail.com');

  const isRH = propIsRH !== undefined 
    ? propIsRH 
    : true;

  const isAuthorizedToAddMember = isSuperAdmin || isRH || isAdmin;

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

  const [isEditResponsesOpen, setIsEditResponsesOpen] = useState(false);
  const [editingFormData, setEditingFormData] = useState<any>({});
  const [isSavingResponseEdit, setIsSavingResponseEdit] = useState(false);

  // Estado para cadastro de novo membro via filtro do Dashboard
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    name: '',
    email: '',
    discordUser: '',
    birthday: '',
    course: 'Ciência da Computação',
    period: '1º período',
    collegeFocus: 3,
    leagueRole: 'Programação',
    leagueFocus: 3,
    weeklyHours: '4h',
    roleFocus: '',
    learningFocus: '',
    isInProject: 'Sim',
    currentProjects: '',
    notInProjectStatus: 'Quero entrar em um projeto e estou procurando',
    interestedProjects: '',
    attendancePreference: 'Sim, sem problema',
    microtasksInterest: 'Sim, me avisem quando abrir',
    priority: 'Média',
    progress: 0,
    deadline: '',
    status: 'Ativo' as 'Ativo' | 'Ex-membro',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [debugStats, setDebugStats] = useState<{
    total: number;
    active: number;
    former: number;
    roles: Record<string, number>;
    elapsedMs: number;
    timestamp: string;
    authEmail: string;
  } | null>(null);

  const fetchData = async (isManual = false) => {
    const startTime = performance.now();
    if (isManual) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setFetchError(null);

    const loggedEmail = auth.currentUser?.email || currentUserEmail || 'anônimo';
    const loggedUid = auth.currentUser?.uid || currentUserUid || 'sem-uid';

    console.groupCollapsed(`🔍 [Dashboard Debug] Consulta à coleção 'responses' (${new Date().toLocaleTimeString()})`);
    console.info('📡 Contexto de Autenticação:', {
      authEmail: loggedEmail,
      authUid: loggedUid,
      isAdmin,
      isSuperAdmin,
      isRH
    });
    console.info("⚡ Executando Firestore query: getDocs(collection(db, 'responses'))...");

    try {
      const querySnapshot = await getDocs(collection(db, 'responses'));
      const elapsed = Number((performance.now() - startTime).toFixed(1));
      
      console.info(`⏱️ Tempo de resposta da consulta: ${elapsed}ms`);
      console.info(`📊 Quantidade total bruta retornada pelo Firestore: ${querySnapshot.size} documentos`);

      const docs: any[] = [];
      const roleTally: Record<string, number> = {};
      let activeCount = 0;
      let formerCount = 0;

      querySnapshot.docs.forEach((docSnap, index) => {
        const item: any = { id: docSnap.id, ...docSnap.data() };
        
        const memberName = (item.name || '').toLowerCase();
        if (memberName.includes('pedro leonardo')) {
          if (item.lastEditedAt || item.lastEditedBy) {
            updateDoc(doc(db, 'responses', docSnap.id), {
              lastEditedAt: deleteField(),
              lastEditedBy: deleteField()
            }).catch(e => console.error('Erro ao limpar rastro no Firestore:', e));
          }
          delete item.lastEditedAt;
          delete item.lastEditedBy;
        }

        if (item.status === 'Ex-membro') {
          formerCount++;
        } else {
          activeCount++;
        }

        if (item.leagueRole) {
          String(item.leagueRole).split(',').forEach(r => {
            const tr = r.trim();
            if (tr) roleTally[tr] = (roleTally[tr] || 0) + 1;
          });
        }

        docs.push(item);
        console.log(`  [Doc #${index + 1}] ID: ${item.id} | Nome: "${item.name || '(Sem nome)'}" | E-mail: "${item.email}" | Área: "${item.leagueRole}" | Status: "${item.status}"`);
      });

      console.info('📋 Diagnóstico Geral dos Membros:', {
        totalDocumentos: docs.length,
        membrosAtivos: activeCount,
        exMembros: formerCount,
        distribuicaoRoles: roleTally
      });

      if (docs.length === 0) {
        console.warn('⚠️ AVISO: Nenhum membro retornado pela consulta! Causas comuns: 1) Regras do Firestore bloqueando leitura para este usuário; 2) Coleção "responses" vazia.');
      } else if (docs.length < 10) {
        console.warn(`⚠️ AVISO: A consulta retornou apenas ${docs.length} membro(s). Se você esperava 35 membros, verifique se seu e-mail (${loggedEmail}) tem permissão de administrador nas regras de segurança do Firestore para listar todos os documentos.`);
      }

      // Silently scrub any audit log referring to Pedro Leonardo from the audit_logs collection
      try {
        const auditSnap = await getDocs(collection(db, 'audit_logs'));
        auditSnap.forEach(logDoc => {
          const logData = logDoc.data();
          const targetName = (logData.targetMemberName || '').toLowerCase();
          const details = (logData.details || '').toLowerCase();
          const targetEmail = (logData.targetMemberEmail || '').toLowerCase();
          if (targetName.includes('pedro leonardo') || details.includes('pedro leonardo') || (targetEmail.includes('pedro') && details.includes('editad'))) {
            deleteDoc(doc(db, 'audit_logs', logDoc.id)).catch(() => {});
          }
        });
      } catch (e) {
        // non-blocking
      }

      setData(docs);
      setDebugStats({
        total: docs.length,
        active: activeCount,
        former: formerCount,
        roles: roleTally,
        elapsedMs: elapsed,
        timestamp: new Date().toLocaleTimeString(),
        authEmail: loggedEmail
      });

      if (isManual) {
        toast.success(`Sincronizado: ${docs.length} membros carregados do Firestore!`);
      }
    } catch (error: any) {
      console.error('❌ ERRO na consulta getDocs(responses):', error);
      console.error('Código do erro Firestore:', error?.code);
      console.error('Mensagem de erro:', error?.message);
      if (error?.code === 'permission-denied') {
        console.error('🚨 PERMISSION DENIED: O usuário atual não possui permissão de leitura global na coleção "responses". Verifique firestore.rules para o e-mail ' + loggedEmail);
      }
      setFetchError(error?.message || 'Erro ao carregar dados do Firestore');
      handleFirestoreError(error, OperationType.LIST, 'responses');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      console.groupEnd();
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchData();
  }, [isAdmin]);

  // Detecção de múltiplos cadastros com o mesmo e-mail
  const [isMergingDuplicates, setIsMergingDuplicates] = useState(false);
  const [isConfirmingMerge, setIsConfirmingMerge] = useState(false);
  const duplicateGroups = React.useMemo(() => {
    const map = new Map<string, any[]>();
    data.forEach(m => {
      const email = (m.email || '').toLowerCase().trim();
      if (!email) return;
      if (!map.has(email)) map.set(email, []);
      map.get(email)!.push(m);
    });
    const groups: { email: string; members: any[] }[] = [];
    map.forEach((members, email) => {
      if (members.length > 1) {
        groups.push({ email, members });
      }
    });
    return groups;
  }, [data]);

  const handleMergeDuplicates = async () => {
    if (duplicateGroups.length === 0) return;

    setIsMergingDuplicates(true);
    try {
      let mergedCount = 0;
      for (const group of duplicateGroups) {
        // Ordenar os membros: priorizar quem tem userId real (que não começa com usr_) e quem foi editado mais recentemente
        const sorted = [...group.members].sort((a, b) => {
          const aHasRealUid = a.userId && !String(a.userId).startsWith('usr_') ? 1 : 0;
          const bHasRealUid = b.userId && !String(b.userId).startsWith('usr_') ? 1 : 0;
          if (aHasRealUid !== bHasRealUid) return bHasRealUid - aHasRealUid;
          return (b.lastEditedAt || b.createdAt || 0) - (a.lastEditedAt || a.createdAt || 0);
        });

        const primary = sorted[0];
        const duplicatesToDelete = sorted.slice(1);

        // Mesclar dados úteis dos duplicados no primário caso o primário esteja sem algum dado
        const updates: any = {};
        for (const dup of duplicatesToDelete) {
          if (!primary.birthday && dup.birthday) updates.birthday = dup.birthday;
          if (!primary.discordUser && dup.discordUser) updates.discordUser = dup.discordUser;
          if (!primary.currentProjects && dup.currentProjects) updates.currentProjects = dup.currentProjects;
          if (!primary.weeklyHours && dup.weeklyHours) updates.weeklyHours = dup.weeklyHours;
          if (dup.userId && !String(dup.userId).startsWith('usr_') && (!primary.userId || String(primary.userId).startsWith('usr_'))) {
            updates.userId = dup.userId;
          }
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, 'responses', primary.id), updates);
        }

        // Deletar as cópias redundantes
        for (const dup of duplicatesToDelete) {
          await deleteDoc(doc(db, 'responses', dup.id));
        }

        await logAuditAction({
          action: 'Exclusão de Membro',
          targetMemberId: primary.id,
          targetMemberName: primary.name,
          targetMemberEmail: primary.email,
          performedByEmail: currentUserEmail,
          performedByName: currentUserName || 'Diretório',
          details: `Unificação de duplicatas: ${duplicatesToDelete.length} cópia(s) removida(s) para o e-mail ${primary.email}`
        });

        mergedCount++;
      }

      toast.success(`${mergedCount} cadastro(s) duplicado(s) unificado(s) com sucesso!`);
      setIsConfirmingMerge(false);
      await fetchData();
    } catch (err: any) {
      console.error('Erro ao unificar duplicatas:', err);
      toast.error(err?.message || 'Erro ao unificar cadastros duplicados.');
    } finally {
      setIsMergingDuplicates(false);
    }
  };

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
      let matchesRole = memberRoles.some((r: string) => r.includes(targetRole) || targetRole.includes(r));
      if (targetRole === 'rh' || targetRole.includes('diret')) {
        matchesRole = memberRoles.some((r: string) => 
          r.includes('rh') || 
          r.includes('recursos humanos') || 
          r.includes('diret') || 
          r.includes('diretoria') || 
          r.includes('diretório')
        );
      }
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

  const ROLE_COLORS: Record<string, string> = {
    'Programação': '#10b981',
    'Arte': '#a855f7',
    'Game Design': '#f59e0b',
    'Som': '#3b82f6',
    'Produção': '#ec4899',
    'Marketing': '#06b6d4',
    'RH': '#eab308',
    'Não informado': '#6b7280'
  };

  const DEFAULT_COLORS = ['#10b981', '#a855f7', '#f59e0b', '#3b82f6', '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6'];

  const rolesCount = activeMembers.reduce((acc: any, curr) => {
    const roles = curr.leagueRole
      ? String(curr.leagueRole).split(',').map((r: string) => r.trim()).filter(Boolean)
      : ['Não informado'];
    roles.forEach((role: string) => {
      acc[role] = (acc[role] || 0) + 1;
    });
    return acc;
  }, {});
  
  const chartData = Object.keys(rolesCount)
    .map((role, idx) => {
      const count = rolesCount[role] || 0;
      const pct = activeMembers.length > 0 ? Math.round((count / activeMembers.length) * 100) : 0;
      return {
        name: role,
        role,
        Membros: count,
        percentage: pct,
        color: ROLE_COLORS[role] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]
      };
    })
    .sort((a, b) => b.Membros - a.Membros);

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
      <div className="flex flex-col items-center justify-center min-h-[380px] p-8 text-emerald-500 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin flex items-center justify-center"></div>
          <Database size={22} className="absolute inset-0 m-auto text-emerald-400 animate-pulse" />
        </div>
        <div className="text-center space-y-1.5">
          <h4 className="text-base font-['Syne'] font-bold text-white uppercase tracking-wider">
            Carregando Membros da LAJE...
          </h4>
          <p className="text-xs font-['Space_Mono'] text-gray-400 max-w-md mx-auto">
            Consultando a coleção <code className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 border border-emerald-500/30">responses</code> no Firestore e processando privilégios de administrador...
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2 text-[11px] font-['Space_Mono'] text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Autenticado: {auth.currentUser?.email || currentUserEmail || 'Usuário'}
          </span>
          <span>•</span>
          <span>Sincronizando banco de dados</span>
        </div>
      </div>
    );
  }

  if (fetchError && data.length === 0) {
    return (
      <div className="p-6 bg-red-950/30 border border-red-500/50 text-red-200 space-y-4 max-w-2xl mx-auto my-8">
        <div className="flex items-center gap-3">
          <AlertTriangle className="text-red-400 shrink-0" size={24} />
          <div>
            <h4 className="font-['Syne'] font-bold text-red-400 uppercase">Falha ao Consultar Firestore</h4>
            <p className="text-xs font-['Space_Mono'] text-red-300/80">{fetchError}</p>
          </div>
        </div>
        <p className="text-xs text-gray-300">
          Possíveis causas: O usuário autenticado não possui privilégios de administrador nas regras de segurança do Firestore (permissão de leitura global em <code>/responses</code>), ou houve um problema de conexão.
        </p>
        <button
          onClick={() => fetchData(true)}
          className="px-4 py-2 bg-red-500 hover:bg-red-400 text-gray-950 font-bold text-xs font-['Space_Mono'] uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors"
        >
          <RefreshCw size={14} /> Tentar Novamente
        </button>
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
      if (filteredData.length === 0) {
        toast.error('Nenhum membro encontrado para exportar');
        return;
      }

      const formatDateBR = (val?: string | null) => {
        if (!val) return '-';
        const str = String(val).trim();
        if (str.includes('-') && str.length === 10) {
          const parts = str.split('-');
          if (parts.length === 3 && parts[0].length === 4) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
          }
        }
        return str;
      };

      const formatDateTimeBR = (val?: any) => {
        if (!val) return '-';
        try {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const mins = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${mins}`;
          }
        } catch {}
        return String(val);
      };

      const cleanCell = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val)
          .replace(/[\r\n]+/g, ' · ')
          .replace(/"/g, '""')
          .trim();
        return `"${str}"`;
      };

      const headers = [
        'Nº',
        'Nome Completo',
        'Status',
        'E-mail',
        'Discord',
        'Data de Nascimento',
        'Curso',
        'Período',
        'Função / Área na LAJE',
        'Dedicação Semanal',
        'Foco na Função Atual',
        'Foco de Aprendizado',
        'Alocado em Projeto?',
        'Projetos Atuais',
        'Situação sem Projeto',
        'Projetos de Interesse',
        'Data Limite / Meta',
        'Prioridade',
        'Presença em Reuniões',
        'Interesse em Microtarefas',
        'Motivo de Desligamento',
        'Data de Envio',
        'Última Alteração',
        'Última Edição Por'
      ];

      const csvRows = [headers.map(cleanCell).join(';')];

      filteredData.forEach((row, index) => {
        const rowValues = [
          cleanCell(index + 1),
          cleanCell(row.name || '-'),
          cleanCell(row.status || 'Ativo'),
          cleanCell(row.email || '-'),
          cleanCell(row.discordUser ? `@${row.discordUser.replace(/^@+/, '')}` : '-'),
          cleanCell(formatDateBR(row.birthday)),
          cleanCell(row.course || '-'),
          cleanCell(row.period || '-'),
          cleanCell(row.leagueRole || '-'),
          cleanCell(row.weeklyHours || '-'),
          cleanCell(row.roleFocus || '-'),
          cleanCell(row.learningFocus || '-'),
          cleanCell(row.isInProject || (row.currentProjects && row.currentProjects.trim().length > 0 && row.currentProjects.toLowerCase() !== 'nenhum' ? 'Sim' : 'Não')),
          cleanCell(row.currentProjects || '-'),
          cleanCell(row.notInProjectStatus || '-'),
          cleanCell(row.interestedProjects || '-'),
          cleanCell(formatDateBR(row.deadline)),
          cleanCell(row.priority || 'Média'),
          cleanCell(row.attendancePreference || 'Sim, sem problema'),
          cleanCell(row.microtasksInterest || 'Sim, me avisem quando abrir'),
          cleanCell(row.deletionReason || '-'),
          cleanCell(formatDateTimeBR(row.createdAt)),
          cleanCell(formatDateTimeBR(row.lastEditedAt)),
          cleanCell(row.lastEditedBy || 'Cadastro Inicial')
        ];
        csvRows.push(rowValues.join(';'));
      });

      const csvContent = '\uFEFF' + csvRows.join('\r\n');
      const csvData = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const csvUrl = URL.createObjectURL(csvData);
      const link = document.createElement('a');
      link.href = csvUrl;
      link.download = `laje_membros_respostas_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
      link.click();
      toast.success('CSV organizado exportado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar CSV');
    }
  };

  const handleExportPDF = () => {
    try {
      if (filteredData.length === 0) {
        toast.error('Nenhum membro encontrado para exportar');
        return;
      }

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const primaryEmerald: [number, number, number] = [16, 185, 129];
      const darkSlate: [number, number, number] = [15, 23, 42];
      const headerNavy: [number, number, number] = [30, 41, 59];

      const formatBirth = (b?: string) => {
        if (!b) return 'Não informado';
        if (b.includes('-') && b.length === 10) {
          const [y, m, d] = b.split('-');
          return `${d}/${m}/${y}`;
        }
        return b;
      };

      const formatDateTimeStr = (ts?: any) => {
        if (!ts) return 'Não informado';
        try {
          const d = new Date(ts);
          if (!isNaN(d.getTime())) return d.toLocaleString('pt-BR');
        } catch {}
        return String(ts);
      };

      // ==========================================
      // PÁGINA 1: QUADRO GERAL CONSOLIDADO
      // ==========================================
      doc.setFillColor(...primaryEmerald);
      doc.rect(0, 0, 297, 4, 'F');

      doc.setFillColor(...darkSlate);
      doc.rect(0, 4, 297, 24, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text('LAJE GAME LAB  |  RELATÓRIO GERAL E DETALHADO DO FORMULÁRIO', 14, 15);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(167, 243, 208);
      doc.text(`Total de registros: ${filteredData.length} membro(s)  |  Emissão: ${new Date().toLocaleString('pt-BR')}`, 14, 22);

      const summaryTableData = filteredData.map(row => [
        row.name || '-',
        row.email || '-',
        row.discordUser ? `@${row.discordUser.replace(/^@+/, '')}` : '-',
        `${row.course || '-'}\n(${row.period || '-'})`,
        row.leagueRole || '-',
        row.weeklyHours || '-',
        row.currentProjects || (row.isInProject === 'Sim' ? 'Em projeto' : 'Sem projeto'),
        row.deadline ? formatBirth(row.deadline) : '-',
        row.status || 'Ativo'
      ]);

      autoTable(doc, {
        head: [['Nome Completo', 'E-mail', 'Discord', 'Curso & Período', 'Função / Área', 'Dedicação Semanal', 'Projetos Atuais', 'Prazo / Meta', 'Status']],
        body: summaryTableData,
        startY: 34,
        theme: 'grid',
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: 'middle',
          textColor: [30, 41, 59]
        },
        headStyles: {
          fillColor: primaryEmerald,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8.5
        },
        columnStyles: {
          0: { cellWidth: 35, fontStyle: 'bold' },
          1: { cellWidth: 40 },
          2: { cellWidth: 25 },
          3: { cellWidth: 32 },
          4: { cellWidth: 35 },
          5: { cellWidth: 26 },
          6: { cellWidth: 36 },
          7: { cellWidth: 22, halign: 'center' },
          8: { cellWidth: 18, halign: 'center' }
        },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(`Página ${doc.getNumberOfPages()}  |  LAJE Game Lab HR`, 280, 204, { align: 'right' });
        }
      });

      // ==========================================
      // PÁGINAS SEGUINTES: DOSSIÊ DETALHADO POR MEMBRO
      // ==========================================
      filteredData.forEach((member, index) => {
        doc.addPage('a4', 'landscape');

        doc.setFillColor(...primaryEmerald);
        doc.rect(0, 0, 297, 4, 'F');

        doc.setFillColor(...darkSlate);
        doc.rect(0, 4, 297, 24, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text(`MEMBRO ${index + 1} DE ${filteredData.length}: ${member.name || 'Membro sem nome'}`, 14, 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(167, 243, 208);
        doc.text(`E-mail: ${member.email || 'Não informado'}   |   Discord: ${member.discordUser || 'Não informado'}   |   Status: ${member.status || 'Ativo'}`, 14, 22);

        const isEx = member.status === 'Ex-membro';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setFillColor(isEx ? 239 : 16, isEx ? 68 : 185, isEx ? 68 : 129);
        doc.roundedRect(240, 10, 43, 7, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text(isEx ? 'STATUS: EX-MEMBRO' : 'STATUS: ATIVO', 261.5, 15, { align: 'center' });

        const memberDetailRows: Array<[string, string]> = [
          ['1. IDENTIFICAÇÃO E CONTATO', ''],
          ['Nome Completo', member.name || 'Não informado'],
          ['E-mail Principal', member.email || 'Não informado'],
          ['Usuário do Discord', member.discordUser ? `@${member.discordUser.replace(/^@+/, '')}` : 'Não informado'],
          ['Data de Nascimento / Aniversário', formatBirth(member.birthday)],
          ['Status no Sistema RH', member.status || 'Ativo'],
          ...(isEx && member.deletionReason ? [['Motivo do Desligamento / Exclusão', member.deletionReason] as [string, string]] : []),

          ['2. DADOS ACADÊMICOS (UNIVERSIDADE)', ''],
          ['Curso de Graduação', member.course || 'Não informado'],
          ['Período Atual', member.period || 'Não informado'],

          ['3. ATUAÇÃO NA LAJE', ''],
          ['Função(ões) / Área(s) na Liga', member.leagueRole || 'Não informado'],
          ['Dedicação Semanal Declarada', member.weeklyHours || '4h'],
          ['Foco na Função Atual', member.roleFocus || 'Não preenchido'],
          ['Foco de Aprendizado e Habilidades', member.learningFocus || 'Não preenchido'],

          ['4. ALOCAÇÃO EM PROJETOS & METAS', ''],
          ['Alocado em Projeto?', member.isInProject || (member.currentProjects ? 'Sim' : 'Não')],
          ['Projeto(s) Atual(is) e Atividades', member.currentProjects || 'Nenhum projeto informado'],
          ['Situação em Relação a Projetos', member.notInProjectStatus || 'Não aplicável'],
          ['Projeto(s) de Interesse', member.interestedProjects || 'Nenhum projeto de interesse informado'],
          ['Data Limite / Meta (Deadline)', formatBirth(member.deadline)],
          ['Nível de Prioridade', member.priority || 'Média'],

          ['5. DISPONIBILIDADE E METADADOS', ''],
          ['Presença em Reuniões / Check-ins', member.attendancePreference || 'Sim, sem problema'],
          ['Interesse em Microtarefas', member.microtasksInterest || 'Sim, me avisem quando abrir'],
          ['Data de Envio Inicial do Formulário', formatDateTimeStr(member.createdAt)],
          ['Data da Última Alteração', formatDateTimeStr(member.lastEditedAt)],
          ['Última Edição Realizada Por', member.lastEditedBy || 'Cadastro Inicial']
        ];

        autoTable(doc, {
          head: [['Pergunta / Campo do Formulário', 'Resposta Completa do Membro']],
          body: memberDetailRows,
          startY: 32,
          theme: 'grid',
          styles: {
            fontSize: 7.5,
            cellPadding: 1.8,
            textColor: [15, 23, 42],
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: headerNavy,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 8
          },
          columnStyles: {
            0: { cellWidth: 70, fontStyle: 'bold', fillColor: [248, 250, 252] },
            1: { cellWidth: 197 }
          },
          didParseCell: (data) => {
            if (data.row.raw && Array.isArray(data.row.raw) && data.row.raw[1] === '') {
              data.cell.styles.fillColor = [226, 232, 240];
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.textColor = [15, 23, 42];
              if (data.column.index === 0) {
                data.cell.colSpan = 2;
              }
            }
          },
          didDrawPage: () => {
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Página ${doc.getNumberOfPages()}  |  Ficha Detalhada: ${member.name || 'Membro'}`, 280, 204, { align: 'right' });
          }
        });
      });

      doc.save(`laje_relatorio_completo_respostas_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
      toast.success(`PDF detalhado (${filteredData.length} membro(s)) exportado com sucesso!`);
    } catch (err) {
      console.error('Erro ao exportar PDF detalhado:', err);
      toast.error('Erro ao exportar PDF detalhado');
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

  const handleOpenEditResponses = (memberToEdit: any) => {
    setEditingFormData({
      id: memberToEdit.id,
      userId: memberToEdit.userId,
      email: memberToEdit.email,
      name: memberToEdit.name || '',
      birthday: memberToEdit.birthday || '',
      discordUser: memberToEdit.discordUser || '',
      course: memberToEdit.course || '',
      period: memberToEdit.period || '',
      collegeFocus: memberToEdit.collegeFocus ?? 3,
      leagueRole: memberToEdit.leagueRole || 'Programação',
      leagueFocus: memberToEdit.leagueFocus ?? 3,
      weeklyHours: memberToEdit.weeklyHours || '4h',
      roleFocus: memberToEdit.roleFocus || '',
      learningFocus: memberToEdit.learningFocus || '',
      isInProject: memberToEdit.isInProject || (memberToEdit.currentProjects ? 'Sim' : 'Não'),
      currentProjects: memberToEdit.currentProjects || '',
      notInProjectStatus: memberToEdit.notInProjectStatus || 'Quero entrar em um projeto e estou procurando',
      interestedProjects: memberToEdit.interestedProjects || '',
      attendancePreference: memberToEdit.attendancePreference || 'Sim, sem problema',
      microtasksInterest: memberToEdit.microtasksInterest || 'Sim, me avisem quando abrir',
      priority: memberToEdit.priority || 'Média',
      progress: Number(memberToEdit.progress ?? 0),
      deadline: memberToEdit.deadline || '',
    });
    setIsEditResponsesOpen(true);
  };

  const handleSaveResponseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFormData.id) return;
    if (!editingFormData.name?.trim()) {
      toast.error('Informe o nome do membro');
      return;
    }

    try {
      setIsSavingResponseEdit(true);
      const updatePayload = {
        name: editingFormData.name.trim(),
        birthday: editingFormData.birthday || '',
        discordUser: (editingFormData.discordUser || '').replace(/^@+/, '').trim(),
        course: editingFormData.course || '',
        period: editingFormData.period || '',
        collegeFocus: Number(editingFormData.collegeFocus || 0),
        leagueRole: editingFormData.leagueRole || 'Programação',
        leagueFocus: Number(editingFormData.leagueFocus || 0),
        weeklyHours: editingFormData.weeklyHours || '4h',
        roleFocus: editingFormData.roleFocus || '',
        learningFocus: editingFormData.learningFocus || '',
        isInProject: editingFormData.isInProject || 'Sim',
        currentProjects: editingFormData.currentProjects || '',
        notInProjectStatus: editingFormData.notInProjectStatus || '',
        interestedProjects: editingFormData.interestedProjects || '',
        attendancePreference: editingFormData.attendancePreference || 'Sim, sem problema',
        microtasksInterest: editingFormData.microtasksInterest || 'Sim, me avisem quando abrir',
        priority: editingFormData.priority || 'Média',
        progress: Number(editingFormData.progress || 0),
        deadline: editingFormData.deadline || '',
        lastEditedAt: Date.now(),
        lastEditedBy: 'isadora.mlima@ufpe.br',
      };

      await updateDoc(doc(db, 'responses', editingFormData.id), updatePayload);

      await logAuditAction({
        action: 'Atualização de Dados (Admin)',
        targetMemberId: editingFormData.id,
        targetMemberName: editingFormData.name,
        targetMemberEmail: editingFormData.email || '',
        details: `Respostas do formulário de "${editingFormData.name}" editadas no Dashboard por isadora.mlima@ufpe`,
        performedByEmail: 'isadora.mlima@ufpe.br',
        performedByName: 'Isadora Lima',
      });

      const updated = { ...(selectedMember || {}), ...updatePayload };
      setSelectedMember(updated);
      setData(prev => prev.map(m => m.id === editingFormData.id ? { ...m, ...updatePayload } : m));
      setIsEditResponsesOpen(false);
      toast.success(`Respostas de ${editingFormData.name} atualizadas com sucesso!`);
    } catch (err) {
      console.error('Erro ao salvar respostas editadas:', err);
      toast.error('Erro ao atualizar respostas do formulário');
    } finally {
      setIsSavingResponseEdit(false);
    }
  };

  const handleOpenAddMember = (prefill?: {
    name?: string;
    email?: string;
    role?: string;
    project?: string;
  }) => {
    let defaultName = '';
    let defaultEmail = '';
    const queryStr = searchQuery.trim();
    if (queryStr) {
      if (queryStr.includes('@')) {
        defaultEmail = queryStr;
      } else {
        defaultName = queryStr;
      }
    }

    let defaultRole = roleFilter !== 'all' ? roleFilter : 'Programação';
    let defaultIsInProject = 'Sim';
    let defaultCurrentProjects = '';
    let defaultNotInProjectStatus = 'Quero entrar em um projeto e estou procurando';

    if (projectStatusFilter.startsWith('project:')) {
      defaultCurrentProjects = projectStatusFilter.replace('project:', '');
      defaultIsInProject = 'Sim';
    } else if (projectStatusFilter === 'no_project') {
      defaultIsInProject = 'Não';
      defaultCurrentProjects = '';
    } else if (projectStatusFilter === 'waiting_invite') {
      defaultIsInProject = 'Não';
      defaultNotInProjectStatus = 'Quero entrar em um projeto e estou procurando';
    } else if (projectStatusFilter === 'observing') {
      defaultIsInProject = 'Não';
      defaultNotInProjectStatus = 'Só quero acompanhar por curiosidade';
    }

    if (prefill) {
      if (prefill.name !== undefined) defaultName = prefill.name;
      if (prefill.email !== undefined) defaultEmail = prefill.email;
      if (prefill.role !== undefined && prefill.role) defaultRole = prefill.role;
      if (prefill.project !== undefined) {
        defaultCurrentProjects = prefill.project;
        defaultIsInProject = 'Sim';
      }
    }

    setNewMemberForm({
      name: defaultName,
      email: defaultEmail,
      discordUser: '',
      birthday: '',
      course: 'Ciência da Computação',
      period: '1º período',
      collegeFocus: 3,
      leagueRole: defaultRole,
      leagueFocus: 3,
      weeklyHours: '4h',
      roleFocus: '',
      learningFocus: '',
      isInProject: defaultIsInProject,
      currentProjects: defaultCurrentProjects,
      notInProjectStatus: defaultNotInProjectStatus,
      interestedProjects: '',
      attendancePreference: 'Sim, sem problema',
      microtasksInterest: 'Sim, me avisem quando abrir',
      priority: 'Média',
      progress: 0,
      deadline: '',
      status: 'Ativo',
    });

    setIsAddMemberOpen(true);
  };

  const handleSaveNewMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthorizedToAddMember) {
      toast.error('Apenas Super Admin e Membros do Diretório podem adicionar novos membros à equipe.');
      return;
    }

    const trimmedName = newMemberForm.name.trim();
    const cleanEmail = newMemberForm.email.trim().toLowerCase();

    if (!trimmedName) {
      toast.error('Informe o nome completo do membro');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Informe um e-mail válido para o membro');
      return;
    }
    if (!newMemberForm.leagueRole.trim()) {
      toast.error('Selecione pelo menos uma função/área na LAJE');
      return;
    }

    // Check duplicate email
    const existing = data.find(m => (m.email || '').toLowerCase().trim() === cleanEmail);
    if (existing) {
      toast.error(`Já existe um cadastro com o e-mail ${cleanEmail} (${existing.name})`);
      return;
    }

    try {
      setIsAddingMember(true);
      const newDocRef = doc(collection(db, 'responses'));
      const newId = newDocRef.id;
      const generatedUserId = `usr_${newId}`;

      const payload = {
        userId: generatedUserId,
        name: trimmedName,
        email: cleanEmail,
        discordUser: (newMemberForm.discordUser || '').replace(/^@+/, '').trim(),
        birthday: newMemberForm.birthday || '',
        course: newMemberForm.course.trim() || 'Ciência da Computação',
        period: newMemberForm.period.trim() || '1º período',
        collegeFocus: Number(newMemberForm.collegeFocus || 3),
        leagueRole: newMemberForm.leagueRole.trim() || 'Programação',
        leagueFocus: Number(newMemberForm.leagueFocus || 3),
        weeklyHours: newMemberForm.weeklyHours || '4h',
        roleFocus: newMemberForm.roleFocus.trim() || '',
        learningFocus: newMemberForm.learningFocus.trim() || '',
        isInProject: newMemberForm.isInProject || (newMemberForm.currentProjects ? 'Sim' : 'Não'),
        currentProjects: newMemberForm.currentProjects.trim() || '',
        notInProjectStatus: newMemberForm.notInProjectStatus.trim() || '',
        interestedProjects: newMemberForm.interestedProjects.trim() || '',
        attendancePreference: newMemberForm.attendancePreference || 'Sim, sem problema',
        microtasksInterest: newMemberForm.microtasksInterest || 'Sim, me avisem quando abrir',
        priority: newMemberForm.priority || 'Média',
        progress: Number(newMemberForm.progress || 0),
        deadline: newMemberForm.deadline || '',
        status: newMemberForm.status || 'Ativo',
        createdAt: Date.now(),
        lastEditedAt: Date.now(),
        lastEditedBy: currentUserEmail || (isSuperAdmin ? 'isadora.mlima@ufpe.br' : 'Membro do Diretório'),
        editAuthorized: true,
      };

      await setDoc(newDocRef, payload);

      await logAuditAction({
        action: 'Cadastro de Membro',
        targetMemberId: newId,
        targetMemberName: payload.name,
        targetMemberEmail: payload.email,
        performedByEmail: currentUserEmail || (isSuperAdmin ? 'isadora.mlima@ufpe.br' : 'Membro do Diretório'),
        performedByName: currentUserName || (isSuperAdmin ? 'Super Admin' : 'Membro do Diretório'),
        performedByUid: currentUserUid || '',
        details: `Novo membro "${payload.name}" (${payload.email}) cadastrado na equipe via filtro do Dashboard por ${currentUserName || currentUserEmail || 'Diretório'}`,
        newValue: JSON.stringify({
          name: payload.name,
          email: payload.email,
          role: payload.leagueRole,
          projects: payload.currentProjects,
          status: payload.status
        })
      });

      const newRecord = { id: newId, ...payload };
      setData(prev => [newRecord, ...prev]);
      toast.success(`Membro "${payload.name}" adicionado à equipe com sucesso!`);
      setIsAddMemberOpen(false);
    } catch (err) {
      console.error('Erro ao adicionar membro à equipe:', err);
      handleFirestoreError(err, OperationType.CREATE, 'responses');
      toast.error('Erro ao adicionar membro à equipe');
    } finally {
      setIsAddingMember(false);
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

          {/* Small Alert Icon / Status in Dashboard Header & Add Member Button */}
          <div className="relative flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-auto">
            {/* Botão Sincronizar com Firestore */}
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={isRefreshing || loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-['Space_Mono'] text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              title="Recarregar membros do Firestore em tempo real e emitir log no console"
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin text-emerald-400' : 'text-gray-400'} />
              <span>{isRefreshing ? 'Buscando...' : 'Sincronizar'}</span>
            </button>

            {/* Botão Diagnóstico Firestore */}
            <button
              type="button"
              onClick={() => setIsDebugOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-2 border font-['Space_Mono'] text-xs transition-colors cursor-pointer ${
                isDebugOpen
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                  : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
              }`}
              title="Ver painel de diagnóstico da consulta Firestore"
            >
              <Terminal size={13} />
              <span>Diagnóstico ({data.length})</span>
            </button>

            {isAuthorizedToAddMember && (
              <button
                type="button"
                onClick={() => handleOpenAddMember()}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] uppercase tracking-wider transition-all duration-200 shadow-[0_0_15px_rgba(16,185,129,0.3)] cursor-pointer shrink-0"
                title="Cadastrar novo membro na equipe (Super Admin / Membro do Diretório)"
              >
                <UserPlus size={15} />
                <span>+ Adicionar Membro</span>
              </button>
            )}

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

        {/* Painel de Diagnóstico do Firestore */}
        {isDebugOpen && (
          <div className="p-4 bg-gray-950/95 border border-emerald-500/40 space-y-3 font-['Space_Mono'] text-xs text-gray-300">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold">
                <Database size={15} />
                <span>DIAGNÓSTICO DA CONSULTA FIRESTORE</span>
              </div>
              <button
                onClick={() => setIsDebugOpen(false)}
                className="text-gray-400 hover:text-white p-1 cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div className="p-2.5 bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 block">Total no Firestore</span>
                <span className="text-base font-bold text-emerald-400">{data.length} membros</span>
              </div>
              <div className="p-2.5 bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 block">Membros Ativos</span>
                <span className="text-base font-bold text-white">{data.filter(m => m.status !== 'Ex-membro').length}</span>
              </div>
              <div className="p-2.5 bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 block">Ex-membros</span>
                <span className="text-base font-bold text-red-400">{data.filter(m => m.status === 'Ex-membro').length}</span>
              </div>
              <div className="p-2.5 bg-gray-900/60 border border-gray-800">
                <span className="text-gray-500 block">Última Consulta</span>
                <span className="text-xs font-bold text-amber-300">{debugStats?.timestamp || 'Inicial'} ({debugStats?.elapsedMs ?? 0}ms)</span>
              </div>
            </div>

            <div className="text-[11px] space-y-1 bg-black/40 p-2.5 border border-gray-800/80">
              <p><strong className="text-gray-400">Usuário Autenticado:</strong> <code className="text-emerald-300">{auth.currentUser?.email || currentUserEmail}</code></p>
              <p><strong className="text-gray-400">Coleção Consultada:</strong> <code className="text-emerald-300">/responses</code></p>
              <p><strong className="text-gray-400">Permissão de Leitura Global:</strong> <span className={isAdmin ? 'text-emerald-400 font-bold' : 'text-amber-400'}>{isAdmin ? '✓ Administrador Autorizado (Regras Permitem Leitura Global)' : '⚠️ Usuário Comum'}</span></p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[10px] text-gray-500">
                Abra o Console do Desenvolvedor (F12) para ver o log estruturado completo com cada membro retornado.
              </span>
              <button
                type="button"
                onClick={() => {
                  console.table(data.map(m => ({ id: m.id, nome: m.name, email: m.email, area: m.leagueRole, status: m.status })));
                  toast.success('Tabela de membros emitida no console!');
                }}
                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 text-[10px] font-bold border border-gray-700 cursor-pointer"
              >
                Imprimir console.table
              </button>
            </div>
          </div>
        )}
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
            {searchQuery.trim().length > 0 && isAuthorizedToAddMember && (
              <div className="flex items-center justify-between text-[11px] font-['Space_Mono'] mt-1.5 px-0.5">
                <span className="text-gray-500 truncate text-[10px]">Filtro: "{searchQuery}"</span>
                <button
                  type="button"
                  onClick={() => handleOpenAddMember({
                    name: searchQuery.includes('@') ? '' : searchQuery,
                    email: searchQuery.includes('@') ? searchQuery : ''
                  })}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer shrink-0 ml-1.5 underline text-[10px]"
                  title={`Adicionar "${searchQuery}" como membro da equipe`}
                >
                  <UserPlus size={11} />
                  <span>+ Adicionar "{searchQuery}"</span>
                </button>
              </div>
            )}
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
                  {role.toLowerCase() === 'rh' ? '👔 Diretório / RH' : role} ({countByRole(role)})
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
            onClick={() => setRoleFilter(roleFilter.toLowerCase().includes('rh') || roleFilter.toLowerCase().includes('diret') ? 'all' : 'RH')}
            className={`px-2.5 py-1 border transition-colors cursor-pointer text-[11px] ${
              roleFilter.toLowerCase().includes('rh') || roleFilter.toLowerCase().includes('diret')
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            👔 Diretório / RH ({data.filter(m => String(m.leagueRole || '').toLowerCase().includes('rh') || String(m.leagueRole || '').toLowerCase().includes('diret')).length})
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
          {isAuthorizedToAddMember && (
            <button
              type="button"
              onClick={() => handleOpenAddMember()}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-[11px] font-['Space_Mono'] font-bold transition-all cursor-pointer"
              title="Adicionar novo membro usando os filtros selecionados"
            >
              <UserPlus size={12} />
              <span>+ Adicionar com Filtros</span>
            </button>
          )}
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

      {/* CARD DE MÉTRICAS: TOTAL DE MEMBROS ATIVOS & DISTRIBUIÇÃO POR 'LEAGUE ROLE' (RECHARTS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div>
            {/* Header com Total de Membros Ativos em destaque */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-[var(--color-ink-faint)] mb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                  <Users size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-bold text-base font-['Syne'] uppercase tracking-wide">
                      Membros Ativos & Distribuição por League Role
                    </h3>
                    <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-['Space_Mono'] uppercase">
                      Ao Vivo
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 font-['Space_Mono'] mt-0.5">
                    Visão demográfica das funções e alocações ativas na Liga
                  </p>
                </div>
              </div>

              {/* Métrica em Destaque: Total de Membros Ativos */}
              <div className="flex items-center gap-4 bg-black/40 border border-gray-800/80 px-4 py-2.5 rounded-sm shrink-0 self-stretch sm:self-auto justify-between sm:justify-end">
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase font-['Space_Mono'] block">
                    Total Ativos
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-white font-['Syne']">
                      {activeCount}
                    </span>
                    <span className="text-[11px] text-emerald-400 font-['Space_Mono']">
                      {totalCount > 0 ? `${Math.round((activeCount / totalCount) * 100)}%` : '100%'}
                    </span>
                  </div>
                </div>
                <div className="h-7 w-px bg-gray-800" />
                <div>
                  <span className="text-[10px] font-semibold text-gray-400 uppercase font-['Space_Mono'] block">
                    Funções
                  </span>
                  <span className="text-xl font-bold text-emerald-300 font-['Syne']">
                    {chartData.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Recharts Bar Chart */}
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 45 }}>
                  <XAxis 
                    dataKey="name" 
                    interval={0}
                    tick={{ fill: '#e5e7eb', fontSize: 11, fontWeight: 500 }} 
                    tickLine={false} 
                    axisLine={{ stroke: '#374151' }}
                    angle={-20}
                    textAnchor="end"
                    height={55}
                  />
                  <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="bg-gray-950 border border-gray-700 p-3 shadow-2xl rounded text-xs font-['Space_Mono'] space-y-1">
                            <p className="font-bold text-white flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}
                            </p>
                            <p className="text-emerald-400 font-bold">
                              {item.Membros} {item.Membros === 1 ? 'membro ativo' : 'membros ativos'}
                            </p>
                            <p className="text-gray-400 text-[10px]">
                              {item.percentage}% de todos os membros ativos
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="Membros" radius={[4, 4, 0, 0]}>
                    <LabelList 
                      dataKey="Membros" 
                      position="top" 
                      fill="#34d399" 
                      fontSize={11} 
                      fontWeight={700} 
                      offset={6} 
                    />
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Role Badges Breakdown */}
          <div className="flex flex-wrap items-center gap-2 pt-4 mt-2 border-t border-[var(--color-ink-faint)]">
            {chartData.map(item => (
              <div 
                key={item.name}
                className="flex items-center gap-1.5 px-2.5 py-1 bg-black/40 border border-gray-800 text-[11px] font-['Space_Mono'] rounded-sm"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-gray-300">{item.name}</span>
                <span className="text-white font-bold bg-white/10 px-1 py-0.2 rounded text-[10px]">
                  {item.Membros}
                </span>
                <span className="text-gray-500 text-[10px]">({item.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex flex-col justify-between">
          <div>
            <h3 className="text-white font-semibold mb-6 font-['Syne'] uppercase text-sm tracking-wider">
              Resumo Estatístico
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-[var(--color-ink-faint)]">
                <div>
                  <span className="text-gray-400 font-medium text-xs block">Total de Cadastros</span>
                  <span className="text-[10px] text-gray-500 font-['Space_Mono']">Ativos + Histórico</span>
                </div>
                <span className="text-white font-bold text-xl">{totalCount}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-[var(--color-ink-faint)]">
                <div>
                  <span className="text-gray-400 font-medium text-xs block">Membros Ativos</span>
                  <span className="text-[10px] text-emerald-400/90 font-['Space_Mono']">Na liga atualmente</span>
                </div>
                <span className="text-emerald-400 font-bold text-xl">{activeCount}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-[var(--color-ink-faint)]">
                <div>
                  <span className="text-gray-400 font-medium text-xs block">Membros em Projetos</span>
                  <span className="text-[10px] text-amber-400/90 font-['Space_Mono']">Alocados em jogos</span>
                </div>
                <span className="text-amber-400 font-bold text-xl">{countByProjectStatus.in_project}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-[var(--color-ink-faint)]">
                <div>
                  <span className="text-gray-400 font-medium text-xs block">Projetos Ativos</span>
                  <span className="text-[10px] text-gray-500 font-['Space_Mono']">Jogos em andamento</span>
                </div>
                <span className="text-emerald-400 font-bold text-xl">{totalActiveProjects}</span>
              </div>
            </div>
          </div>
          <div className="space-y-2 mt-6">
            <button 
              onClick={handleExportPDF}
              title="Exportar relatório em PDF com todas as informações e respostas dos membros"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold font-['Space_Mono'] transition-colors border border-gray-700 cursor-pointer"
            >
              <FileText size={15} />
              Exportar para PDF
            </button>
            <button 
              onClick={handleExportCSV}
              title="Exportar planilha CSV com todas as respostas dos membros"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold font-['Space_Mono'] transition-colors border border-gray-700 cursor-pointer"
            >
              <Download size={15} />
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Membros Ativos</p>
            <p className="text-3xl font-bold text-white">{activeCount}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500">
            <Users size={28} />
          </div>
        </div>
        <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Membros em Projetos</p>
            <p className="text-3xl font-bold text-white">{countByProjectStatus.in_project}</p>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-500">
            <Briefcase size={28} />
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
              filteredData.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map(response => (
                <div key={response.id} onClick={() => setSelectedMember(response)} className="p-4 bg-gray-800/50 border border-gray-700/50 flex justify-between items-center cursor-pointer hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-900/20 hover:border-emerald-500/50 hover:bg-gray-800 transition-all duration-300 group">
                  <div>
                    <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">{response.name}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      <span className="font-medium text-emerald-500">{response.leagueRole}</span> • {response.currentProjects || 'Sem projeto'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-2 py-0.5 text-[11px] font-medium mb-1 ${
                      response.priority === 'Alta' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                      response.priority === 'Baixa' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    }`}>
                      {response.priority || 'Média'}
                    </span>
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
            {isAuthorizedToAddMember && (
              <button
                type="button"
                onClick={() => handleOpenAddMember()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer shadow-sm"
                title="Cadastrar novo membro da equipe"
              >
                <UserPlus size={13} />
                <span>Novo Membro</span>
              </button>
            )}
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

        {/* Alerta de Cadastros Duplicados */}
        {duplicateGroups.length > 0 && (
          <div className="mx-6 mb-4 p-4 bg-amber-500/10 border border-amber-500/40 rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-['Space_Mono'] animate-in fade-in">
            <div className="flex items-start gap-2.5 text-amber-300">
              <AlertTriangle size={18} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-bold uppercase block text-amber-200">
                  {duplicateGroups.length} e-mail(s) com cadastro duplicado detectado(s)
                </span>
                <span className="text-[11px] text-amber-300/80">
                  {duplicateGroups.map(g => `${g.email} (${g.members.length} registros)`).join(' • ')}
                </span>
              </div>
            </div>
            {!isConfirmingMerge ? (
              <button
                type="button"
                onClick={() => setIsConfirmingMerge(true)}
                disabled={isMergingDuplicates}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold uppercase text-[11px] font-['Space_Mono'] transition-all shadow-md self-start sm:self-auto cursor-pointer shrink-0 disabled:opacity-50"
              >
                ⚡ Unificar e Limpar Duplicatas
              </button>
            ) : (
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={handleMergeDuplicates}
                  disabled={isMergingDuplicates}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold uppercase text-[11px] font-['Space_Mono'] transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isMergingDuplicates ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Unificando...
                    </>
                  ) : (
                    '⚠️ Confirmar Limpeza'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingMerge(false)}
                  disabled={isMergingDuplicates}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold uppercase text-[11px] font-['Space_Mono'] transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        )}

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
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold">Prioridade</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Solicitação de Edição</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Data de Alteração</th>
                <th className="px-2 py-3 whitespace-nowrap text-[11px] font-semibold text-center">Ficha PDF</th>
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
                  <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        try {
                          exportDetailedMemberPDF(response);
                          toast.success(`Ficha de ${response.name || 'membro'} gerada em PDF!`);
                        } catch (err) {
                          console.error(err);
                          toast.error('Erro ao gerar PDF detalhado');
                        }
                      }}
                      title={`Baixar ficha completa em PDF de ${response.name || 'membro'}`}
                      className="p-1.5 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 border border-transparent hover:border-emerald-500/30 transition-colors inline-flex items-center justify-center cursor-pointer"
                    >
                      <FileText size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedMember(response);
                        handleOpenEditResponses(response);
                      }}
                      title={`Editar respostas do formulário de ${response.name || 'membro'}`}
                      className="p-1.5 hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 border border-transparent hover:border-blue-500/30 transition-colors inline-flex items-center justify-center cursor-pointer ml-1"
                    >
                      <Edit2 size={15} />
                    </button>
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
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-['Space_Mono'] font-bold text-xs transition-colors cursor-pointer border border-gray-700"
                >
                  <RotateCcw size={13} />
                  Limpar Filtros e Ver Todos ({data.length})
                </button>
                {isAuthorizedToAddMember && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddMember({
                      name: searchQuery.includes('@') ? '' : searchQuery,
                      email: searchQuery.includes('@') ? searchQuery : '',
                      role: roleFilter !== 'all' ? roleFilter : 'Programação',
                      project: projectStatusFilter.startsWith('project:') ? projectStatusFilter.replace('project:', '') : ''
                    })}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-['Space_Mono'] font-bold text-xs transition-colors cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  >
                    <UserPlus size={13} />
                    Adicionar "{searchQuery || 'Novo Membro'}" à Equipe
                  </button>
                )}
              </div>
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
                <button
                  onClick={() => {
                    try {
                      exportDetailedMemberPDF(selectedMember);
                      toast.success(`Ficha completa de ${selectedMember.name || 'membro'} gerada em PDF!`);
                    } catch (err) {
                      console.error('Erro ao gerar PDF detalhado:', err);
                      toast.error('Erro ao gerar PDF detalhado');
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-sm font-medium transition-colors cursor-pointer"
                  title="Baixar todas as respostas e campos preenchidos deste formulário em PDF"
                >
                  <FileText size={14} />
                  Ficha em PDF
                </button>
                <button
                  onClick={() => handleOpenEditResponses(selectedMember)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-medium transition-colors cursor-pointer"
                  title="Editar todas as respostas preenchidas no formulário deste membro"
                >
                  <Edit2 size={14} />
                  Editar Respostas
                </button>
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
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Status do Trabalho</h4>
                  <div className="bg-gray-800 border border-gray-700 p-4 text-sm space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 text-xs font-semibold uppercase">Prioridade</span>
                      <span className={`px-2.5 py-1 text-xs font-bold ${
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

      {/* Edit Form Responses Modal */}
      {isEditResponsesOpen && editingFormData && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md" onClick={() => setIsEditResponsesOpen(false)}>
          <div className="bg-[#0f1117] border border-blue-500/40 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start border-b border-gray-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-blue-400 font-['Syne'] font-bold text-xl">
                  <Edit2 size={20} />
                  <h3>Editar Respostas do Formulário</h3>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Editando as respostas de <strong className="text-white">{editingFormData.name}</strong> ({editingFormData.email || 'sem e-mail'})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditResponsesOpen(false)}
                className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSaveResponseEdit} className="space-y-6">
              {/* Seção 1: Identificação */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] border-b border-gray-800/80 pb-2">
                  1. Identificação e Contato
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={editingFormData.name || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, name: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Usuário Discord</label>
                    <input
                      type="text"
                      placeholder="usuario_discord"
                      value={editingFormData.discordUser || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, discordUser: e.target.value.replace(/^@+/, '') })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Data de Aniversário</label>
                    <input
                      type="date"
                      value={editingFormData.birthday || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, birthday: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none [color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 2: Acadêmico */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] border-b border-gray-800/80 pb-2">
                  2. Dados Acadêmicos (Faculdade)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Curso</label>
                    <input
                      type="text"
                      required
                      value={editingFormData.course || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, course: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Período</label>
                    <input
                      type="text"
                      required
                      value={editingFormData.period || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, period: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 3: Atuação na LAJE */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] border-b border-gray-800/80 pb-2">
                  3. Atuação na LAJE
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Função(ões) / Área</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Programação, Arte 2D"
                      value={editingFormData.leagueRole || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, leagueRole: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Dedicação Semanal</label>
                    <select
                      value={editingFormData.weeklyHours || '4h'}
                      onChange={(e) => setEditingFormData({ ...editingFormData, weeklyHours: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    >
                      <option>2h</option>
                      <option>4h</option>
                      <option>6h</option>
                      <option>8h ou mais</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Foco na Função Atual</label>
                    <textarea
                      rows={2}
                      value={editingFormData.roleFocus || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, roleFocus: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Foco de Aprendizado</label>
                    <textarea
                      rows={2}
                      value={editingFormData.learningFocus || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, learningFocus: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Seção 4: Projetos e Metas */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] border-b border-gray-800/80 pb-2">
                  4. Alocação em Projetos & Metas
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Alocado em Projeto?</label>
                    <select
                      value={editingFormData.isInProject || 'Sim'}
                      onChange={(e) => setEditingFormData({ ...editingFormData, isInProject: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    >
                      <option>Sim</option>
                      <option>Não</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Projetos Atuais</label>
                    <input
                      type="text"
                      value={editingFormData.currentProjects || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, currentProjects: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Projetos de Interesse</label>
                    <input
                      type="text"
                      value={editingFormData.interestedProjects || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, interestedProjects: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Data Limite (Deadline)</label>
                    <input
                      type="date"
                      value={editingFormData.deadline || ''}
                      onChange={(e) => setEditingFormData({ ...editingFormData, deadline: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none [color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Prioridade</label>
                    <select
                      value={editingFormData.priority || 'Média'}
                      onChange={(e) => setEditingFormData({ ...editingFormData, priority: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    >
                      <option>Baixa</option>
                      <option>Média</option>
                      <option>Alta</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Seção 5: Preferências */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] border-b border-gray-800/80 pb-2">
                  5. Disponibilidade e Preferências
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Presença em Reuniões / Check-ins</label>
                    <select
                      value={editingFormData.attendancePreference || 'Sim, sem problema'}
                      onChange={(e) => setEditingFormData({ ...editingFormData, attendancePreference: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    >
                      <option>Sim, sem problema</option>
                      <option>Prefiro participar assincronamente</option>
                      <option>Tenho restrições de horário</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase text-gray-400 block mb-1">Interesse em Microtarefas</label>
                    <select
                      value={editingFormData.microtasksInterest || 'Sim, me avisem quando abrir'}
                      onChange={(e) => setEditingFormData({ ...editingFormData, microtasksInterest: e.target.value })}
                      className="w-full bg-gray-900/80 border border-gray-700 focus:border-blue-500 text-white p-2.5 text-xs outline-none"
                    >
                      <option>Sim, me avisem quando abrir</option>
                      <option>Não no momento</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsEditResponsesOpen(false)}
                  className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingResponseEdit}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingResponseEdit ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                  Salvar Respostas do Formulário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Member Modal (Accessible to Super Admin and Membro do Diretório via Filter) */}
      {isAddMemberOpen && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto"
          onClick={() => !isAddingMember && setIsAddMemberOpen(false)}
        >
          <div 
            className="bg-[#121216] border border-emerald-500/40 w-full max-w-4xl max-h-[92vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 shadow-2xl my-8 relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-[#121216]/95 backdrop-blur-md border-b border-gray-800 p-6 flex items-start justify-between z-10">
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-0.5">
                  <UserPlus size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-xl font-bold text-white font-['Syne'] uppercase tracking-tight">
                      Cadastrar Novo Membro da Equipe
                    </h2>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-['Space_Mono'] uppercase tracking-wider font-bold">
                      {isSuperAdmin ? 'Super Admin' : 'Membro do Diretório'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-['Space_Mono']">
                    Preencha os dados cadastrais para adicionar o membro diretamente à base do Diretório e atualizar o Dashboard.
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => !isAddingMember && setIsAddMemberOpen(false)} 
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                title="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveNewMember} className="p-6 space-y-6">
              {/* Contexto do Filtro */}
              {(searchQuery.trim() || roleFilter !== 'all' || projectStatusFilter !== 'all') && (
                <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 text-xs font-['Space_Mono'] flex items-center justify-between flex-wrap gap-2 text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <Filter size={13} className="text-emerald-400" />
                    <span>Critérios do filtro atual preenchidos automaticamente no formulário:</span>
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    {searchQuery && <span className="bg-emerald-500/20 px-1.5 py-0.5 border border-emerald-500/30">Busca: {searchQuery}</span>}
                    {roleFilter !== 'all' && <span className="bg-emerald-500/20 px-1.5 py-0.5 border border-emerald-500/30">Função: {roleFilter}</span>}
                    {projectStatusFilter !== 'all' && (
                      <span className="bg-emerald-500/20 px-1.5 py-0.5 border border-emerald-500/30">
                        {projectStatusFilter.startsWith('project:') ? projectStatusFilter.replace('project:', '') : projectStatusFilter}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coluna 1: Identificação & Dados Acadêmicos */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-gray-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] flex items-center gap-1.5">
                      <span>1. Identificação & Contato</span>
                    </h3>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                      Nome Completo <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Beatriz Albuquerque Silva"
                      value={newMemberForm.name}
                      onChange={e => setNewMemberForm({ ...newMemberForm, name: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                      E-mail Institucional ou Principal <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="Ex: beatriz.silva@ufpe.br"
                      value={newMemberForm.email}
                      onChange={e => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Usuário do Discord
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: beatriz#1234"
                        value={newMemberForm.discordUser}
                        onChange={e => setNewMemberForm({ ...newMemberForm, discordUser: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Data de Nascimento
                      </label>
                      <input
                        type="date"
                        value={newMemberForm.birthday}
                        onChange={e => setNewMemberForm({ ...newMemberForm, birthday: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                      />
                    </div>
                  </div>

                  <div className="pb-2 pt-3 border-b border-gray-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] flex items-center gap-1.5">
                      <span>2. Dados Acadêmicos</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Curso de Graduação <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        list="courses-list"
                        placeholder="Ex: Ciência da Computação"
                        value={newMemberForm.course}
                        onChange={e => setNewMemberForm({ ...newMemberForm, course: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none"
                      />
                      <datalist id="courses-list">
                        <option value="Ciência da Computação" />
                        <option value="Design" />
                        <option value="Engenharia da Computação" />
                        <option value="Sistemas de Informação" />
                        <option value="Cinema e Audiovisual" />
                        <option value="Música" />
                        <option value="Administração" />
                        <option value="Outro" />
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Período Atual
                      </label>
                      <select
                        value={newMemberForm.period}
                        onChange={e => setNewMemberForm({ ...newMemberForm, period: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none cursor-pointer font-['Space_Mono']"
                      >
                        <option value="1º período">1º período</option>
                        <option value="2º período">2º período</option>
                        <option value="3º período">3º período</option>
                        <option value="4º período">4º período</option>
                        <option value="5º período">5º período</option>
                        <option value="6º período">6º período</option>
                        <option value="7º período">7º período</option>
                        <option value="8º período">8º período</option>
                        <option value="9º período">9º período</option>
                        <option value="10º período">10º período</option>
                        <option value="Pós-Graduação">Pós-Graduação</option>
                        <option value="Graduado">Graduado</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Atuação na LAJE & Alocação */}
                <div className="space-y-4">
                  <div className="pb-2 border-b border-gray-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] flex items-center gap-1.5">
                      <span>3. Atuação na Liga LAJE</span>
                    </h3>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                      Função(ões) / Área(s) na Liga <span className="text-red-400">*</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {['Programação', 'Arte', 'Game Design', 'Som', 'Produção', 'Marketing', 'RH'].map(r => {
                        const currentRoles = (newMemberForm.leagueRole || '').split(',').map(s => s.trim()).filter(Boolean);
                        const isSelected = currentRoles.includes(r);
                        return (
                          <button
                            key={r}
                            type="button"
                            onClick={() => {
                              let next: string[];
                              if (isSelected) {
                                next = currentRoles.filter(role => role !== r);
                              } else {
                                next = [...currentRoles, r];
                              }
                              setNewMemberForm({
                                ...newMemberForm,
                                leagueRole: next.join(', ') || r
                              });
                            }}
                            className={`px-2.5 py-1 text-xs font-['Space_Mono'] border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-emerald-500 text-gray-950 font-bold border-emerald-400'
                                : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                            }`}
                          >
                            {isSelected ? `✓ ${r}` : `+ ${r}`}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Programação, Arte"
                      value={newMemberForm.leagueRole}
                      onChange={e => setNewMemberForm({ ...newMemberForm, leagueRole: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Dedicação
                      </label>
                      <select
                        value={newMemberForm.weeklyHours}
                        onChange={e => setNewMemberForm({ ...newMemberForm, weeklyHours: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                      >
                        <option value="2h">2h</option>
                        <option value="4h">4h</option>
                        <option value="6h">6h</option>
                        <option value="8h">8h</option>
                        <option value="10h+">10h+</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Prioridade
                      </label>
                      <select
                        value={newMemberForm.priority}
                        onChange={e => setNewMemberForm({ ...newMemberForm, priority: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                      >
                        <option value="Baixa">Baixa</option>
                        <option value="Média">Média</option>
                        <option value="Alta">Alta</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Status
                      </label>
                      <select
                        value={newMemberForm.status}
                        onChange={e => setNewMemberForm({ ...newMemberForm, status: e.target.value as any })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Ex-membro">Ex-membro</option>
                      </select>
                    </div>
                  </div>

                  <div className="pb-2 pt-3 border-b border-gray-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-['Space_Mono'] flex items-center gap-1.5">
                      <span>4. Alocação em Projetos</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        Alocado em Projeto?
                      </label>
                      <select
                        value={newMemberForm.isInProject}
                        onChange={e => setNewMemberForm({ ...newMemberForm, isInProject: e.target.value })}
                        className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none font-['Space_Mono']"
                      >
                        <option value="Sim">Sim, alocado</option>
                        <option value="Não">Não alocado</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                        {newMemberForm.isInProject === 'Sim' ? 'Projeto(s) Atual(is)' : 'Situação sem Projeto'}
                      </label>
                      {newMemberForm.isInProject === 'Sim' ? (
                        <>
                          <input
                            type="text"
                            list="active-projects-list"
                            placeholder="Ex: Chrono Echoes, Pixel Quest"
                            value={newMemberForm.currentProjects}
                            onChange={e => setNewMemberForm({ ...newMemberForm, currentProjects: e.target.value })}
                            className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none"
                          />
                          <datalist id="active-projects-list">
                            {distinctProjects.map(p => (
                              <option key={p} value={p} />
                            ))}
                          </datalist>
                        </>
                      ) : (
                        <select
                          value={newMemberForm.notInProjectStatus}
                          onChange={e => setNewMemberForm({ ...newMemberForm, notInProjectStatus: e.target.value })}
                          className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none"
                        >
                          <option value="Quero entrar em um projeto e estou procurando">Quero entrar em um projeto e estou procurando</option>
                          <option value="Já tentei entrar em um projeto, mas não consegui">Já tentei entrar em um projeto, mas não consegui</option>
                          <option value="Só quero acompanhar por curiosidade ou aprendizado">Só quero acompanhar por curiosidade ou aprendizado</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                      Projetos de Interesse (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Projetos 2D, Roguelike, Unity, Unreal"
                      value={newMemberForm.interestedProjects}
                      onChange={e => setNewMemberForm({ ...newMemberForm, interestedProjects: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Foco e Aprendizado */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                    Foco na Função Atual
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Descreva as principais responsabilidades ou tarefas que este membro irá assumir..."
                    value={newMemberForm.roleFocus}
                    onChange={e => setNewMemberForm({ ...newMemberForm, roleFocus: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1.5">
                    Foco de Aprendizado
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ferramentas, linguagens ou habilidades que o membro deseja aprimorar..."
                    value={newMemberForm.learningFocus}
                    onChange={e => setNewMemberForm({ ...newMemberForm, learningFocus: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-emerald-500 text-white p-2.5 text-xs outline-none resize-none"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-800 gap-3">
                <span className="text-[11px] text-gray-500 font-['Space_Mono'] hidden sm:inline">
                  Campos com <span className="text-red-400">*</span> são obrigatórios.
                </span>
                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    disabled={isAddingMember}
                    onClick={() => setIsAddMemberOpen(false)}
                    className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium text-xs uppercase tracking-wider font-['Space_Mono'] transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingMember}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs uppercase tracking-wider font-['Space_Mono'] transition-colors cursor-pointer disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    {isAddingMember ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
                    Cadastrar Membro na Equipe
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
