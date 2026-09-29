import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { logAuditAction } from '../lib/audit';
import toast from 'react-hot-toast';
import { 
  HelpCircle, 
  MessageSquare, 
  Send, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Plus, 
  X, 
  User, 
  Shield, 
  Filter, 
  Lock, 
  Eye, 
  Trash2, 
  Calendar,
  MessageCircle,
  Tag
} from 'lucide-react';

export interface Doubt {
  id: string;
  userId: string;
  authorName: string;
  authorEmail: string;
  authorDiscord?: string;
  authorRole?: string;
  category?: string;
  title: string;
  description: string;
  priority?: string;
  status: 'pendente' | 'em_analise' | 'respondida';
  response?: string;
  answeredBy?: string;
  answeredByRole?: string;
  answeredAt?: number;
  createdAt: number;
}

interface DirectorioDoubtsProps {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  isRH?: boolean;
  currentUserEmail?: string;
  currentUserName?: string;
  currentUserUid?: string;
  currentUserRole?: string;
  token?: string;
}

export default function DirectorioDoubts({
  isAdmin = false,
  isSuperAdmin = false,
  isRH = false,
  currentUserEmail = '',
  currentUserName = '',
  currentUserUid = '',
  currentUserRole = ''
}: DirectorioDoubtsProps) {
  // O Diretório ou Super Admin gerenciam e respondem a todas as dúvidas
  const canManageDoubts = isSuperAdmin || isRH || isAdmin;

  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todas' | 'pendente' | 'em_analise' | 'respondida'>('todas');
  const [categoryFilter, setCategoryFilter] = useState('todas');

  // Modal / Ações de Nova Dúvida
  const [isNewDoubtModalOpen, setIsNewDoubtModalOpen] = useState(false);
  const [isSubmittingDoubt, setIsSubmittingDoubt] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Geral');
  const [newPriority, setNewPriority] = useState('Normal');
  const [newDescription, setNewDescription] = useState('');
  const [memberDiscord, setMemberDiscord] = useState('');

  // Modal / Ação de Resposta pelo Diretório
  const [selectedDoubtForAnswer, setSelectedDoubtForAnswer] = useState<Doubt | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responseStatus, setResponseStatus] = useState<'respondida' | 'em_analise'>('respondida');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Modal para ver detalhes completos
  const [viewingDoubt, setViewingDoubt] = useState<Doubt | null>(null);

  // Buscar discord do membro logado para preencher na dúvida
  useEffect(() => {
    if (!currentUserUid && !currentUserEmail) return;
    const fetchMemberData = async () => {
      try {
        let respQ;
        if (currentUserUid) {
          respQ = query(collection(db, 'responses'), where('userId', '==', currentUserUid));
        } else {
          respQ = query(collection(db, 'responses'), where('email', '==', currentUserEmail));
        }
        const snap = await getDocs(respQ);
        if (!snap.empty) {
          const d = snap.docs[0].data() as Record<string, any>;
          if (d.discordUser) setMemberDiscord(d.discordUser);
        }
      } catch {
        // silencioso
      }
    };
    fetchMemberData();
  }, [currentUserUid, currentUserEmail]);

  // Carregar dúvidas em tempo real respeitando a privacidade:
  // Se for Diretório / Super Admin: busca todas as dúvidas
  // Se for membro normal: busca APENAS as dúvidas onde userId == currentUserUid
  useEffect(() => {
    setLoading(true);
    let q;

    try {
      if (canManageDoubts) {
        q = query(collection(db, 'doubts'), orderBy('createdAt', 'desc'));
      } else {
        if (!currentUserUid) {
          setLoading(false);
          return;
        }
        q = query(collection(db, 'doubts'), where('userId', '==', currentUserUid));
      }

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: Doubt[] = [];
          snapshot.forEach((docSnap) => {
            list.push({ id: docSnap.id, ...docSnap.data() } as Doubt);
          });
          // Para membros normais, ordenar decrescente no cliente
          if (!canManageDoubts) {
            list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          }
          setDoubts(list);
          setLoading(false);
        },
        (error) => {
          console.error('Erro ao escutar dúvidas:', error);
          handleFirestoreError(error, OperationType.LIST, 'doubts');
          setLoading(false);
        }
      );

      return () => unsubscribe();
    } catch (err) {
      console.error('Falha ao configurar snapshot de dúvidas:', err);
      setLoading(false);
    }
  }, [canManageDoubts, currentUserUid]);

  // Enviar Nova Dúvida (Disponível para qualquer membro)
  const handleCreateDoubt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserUid) {
      toast.error('Você precisa estar autenticado para enviar uma dúvida.');
      return;
    }

    const cleanTitle = newTitle.trim();
    const cleanDesc = newDescription.trim();

    if (!cleanTitle) {
      toast.error('Informe o assunto da dúvida.');
      return;
    }
    if (cleanTitle.length > 300) {
      toast.error('O assunto deve ter no máximo 300 caracteres.');
      return;
    }
    if (!cleanDesc) {
      toast.error('Por favor, descreva detalhadamente sua dúvida.');
      return;
    }
    if (cleanDesc.length > 5000) {
      toast.error('A descrição deve ter no máximo 5000 caracteres.');
      return;
    }

    setIsSubmittingDoubt(true);
    try {
      const doubtId = crypto.randomUUID();
      const payload: Omit<Doubt, 'id'> = {
        userId: currentUserUid,
        authorName: currentUserName || currentUserEmail.split('@')[0] || 'Membro',
        authorEmail: currentUserEmail,
        authorDiscord: memberDiscord.trim() || undefined,
        authorRole: currentUserRole || 'Membro da LAJE',
        category: newCategory,
        title: cleanTitle,
        description: cleanDesc,
        priority: newPriority,
        status: 'pendente',
        createdAt: Date.now()
      };

      await setDoc(doc(db, 'doubts', doubtId), payload);

      toast.success('Dúvida enviada com sucesso ao Diretório! Você receberá a resposta por aqui.');
      setNewTitle('');
      setNewDescription('');
      setNewCategory('Geral');
      setNewPriority('Normal');
      setIsNewDoubtModalOpen(false);
    } catch (error) {
      console.error('Erro ao enviar dúvida:', error);
      toast.error('Erro ao enviar dúvida. Tente novamente.');
      handleFirestoreError(error, OperationType.CREATE, 'doubts');
    } finally {
      setIsSubmittingDoubt(false);
    }
  };

  // Responder Dúvida (Exclusivo para Diretório / Super Admin)
  const handleSendResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoubtForAnswer) return;
    if (!canManageDoubts) {
      toast.error('Apenas membros do Diretório e Super Admin podem responder dúvidas.');
      return;
    }

    const cleanAnswer = responseText.trim();
    if (!cleanAnswer) {
      toast.error('Digite a resposta para o membro.');
      return;
    }
    if (cleanAnswer.length > 5000) {
      toast.error('A resposta não pode exceder 5000 caracteres.');
      return;
    }

    setIsSubmittingResponse(true);
    try {
      const responderRole = isSuperAdmin ? 'Super Admin' : 'Membro do Diretório';
      const responderName = currentUserName || (isSuperAdmin ? 'Super Admin' : 'Membro do Diretório');

      const updates: Partial<Doubt> = {
        status: responseStatus,
        response: cleanAnswer,
        answeredBy: responderName,
        answeredByRole: responderRole,
        answeredAt: Date.now()
      };

      await updateDoc(doc(db, 'doubts', selectedDoubtForAnswer.id), updates);

      await logAuditAction({
        action: 'Resposta a Dúvida',
        targetMemberId: selectedDoubtForAnswer.userId,
        targetMemberName: selectedDoubtForAnswer.authorName,
        targetMemberEmail: selectedDoubtForAnswer.authorEmail,
        performedByEmail: currentUserEmail,
        performedByName: responderName,
        details: `Dúvida "${selectedDoubtForAnswer.title}" respondida pelo ${responderRole} (${responderName})`,
        previousValue: selectedDoubtForAnswer.status,
        newValue: responseStatus
      });

      toast.success('Resposta registrada e enviada ao membro com sucesso!');
      setSelectedDoubtForAnswer(null);
      setResponseText('');
      setResponseStatus('respondida');
    } catch (error) {
      console.error('Erro ao enviar resposta:', error);
      toast.error('Erro ao enviar resposta.');
      handleFirestoreError(error, OperationType.UPDATE, `doubts/${selectedDoubtForAnswer.id}`);
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // Excluir Dúvida (Autor se estiver pendente, ou Diretório/Super Admin a qualquer momento)
  const handleDeleteDoubt = async (doubt: Doubt) => {
    const isAuthor = doubt.userId === currentUserUid;
    if (!canManageDoubts && !isAuthor) {
      toast.error('Você não tem permissão para excluir esta dúvida.');
      return;
    }

    if (!window.confirm(`Tem certeza que deseja remover a dúvida "${doubt.title}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'doubts', doubt.id));
      toast.success('Dúvida removida com sucesso!');
      if (viewingDoubt?.id === doubt.id) setViewingDoubt(null);
      if (selectedDoubtForAnswer?.id === doubt.id) setSelectedDoubtForAnswer(null);
    } catch (error) {
      console.error('Erro ao deletar dúvida:', error);
      toast.error('Erro ao excluir dúvida.');
      handleFirestoreError(error, OperationType.DELETE, `doubts/${doubt.id}`);
    }
  };

  // Filtros em memória
  const filteredDoubts = useMemo(() => {
    return doubts.filter((d) => {
      if (statusFilter !== 'todas' && d.status !== statusFilter) {
        return false;
      }
      if (categoryFilter !== 'todas' && d.category !== categoryFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = d.title?.toLowerCase().includes(q);
        const inDesc = d.description?.toLowerCase().includes(q);
        const inAuthor = d.authorName?.toLowerCase().includes(q) || d.authorEmail?.toLowerCase().includes(q);
        const inCategory = d.category?.toLowerCase().includes(q);
        const inResponse = d.response?.toLowerCase().includes(q);
        if (!inTitle && !inDesc && !inAuthor && !inCategory && !inResponse) {
          return false;
        }
      }
      return true;
    });
  }, [doubts, statusFilter, categoryFilter, searchQuery]);

  // Contadores
  const counts = useMemo(() => {
    return {
      total: doubts.length,
      pendentes: doubts.filter(d => d.status === 'pendente').length,
      emAnalise: doubts.filter(d => d.status === 'em_analise').length,
      respondidas: doubts.filter(d => d.status === 'respondida').length,
    };
  }, [doubts]);

  const categories = [
    'Geral',
    'Projetos & Games',
    'Horas & Presença',
    'Administrativo & Diretório',
    'Capacitação & Treinamento',
    'Estrutura & Laje',
    'Outro'
  ];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Cabeçalho da Aba */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--color-ink-faint)] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-emerald-400 font-['Space_Mono'] text-xs uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <MessageSquare size={14} /> Canal Oficial de Comunicação
            </span>
            {canManageDoubts && (
              <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-['Space_Mono'] uppercase tracking-wider font-bold rounded">
                Visão do {isSuperAdmin ? 'Super Admin' : 'Membro do Diretório'}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-['Syne'] font-bold text-[var(--color-ink)] tracking-tight">
            Contato com o Diretório & Dúvidas
          </h1>
          <p className="text-sm text-[var(--color-ink-muted)] mt-1 font-['Space_Mono']">
            {canManageDoubts 
              ? 'Visualize, acompanhe e responda às dúvidas encaminhadas pelos membros da LAJE.'
              : 'Tire suas dúvidas diretamente com os Membros do Diretório de forma privada e confidencial.'}
          </p>
        </div>

        <button
          onClick={() => setIsNewDoubtModalOpen(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-sm font-['Space_Mono'] uppercase tracking-wider transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus size={16} />
          <span>Tirar Dúvida</span>
        </button>
      </div>

      {/* Aviso de Privacidade Rigorosa para Membros */}
      {!canManageDoubts && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded flex items-start gap-3 text-xs text-emerald-200/90 font-['Space_Mono']">
          <Lock size={18} className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-emerald-300 uppercase block mb-0.5">Canal Privado & Confidencial</span>
            As perguntas cadastradas aqui são visíveis <strong>apenas para você</strong> e para os <strong>Membros do Diretório / Super Admin</strong>. Nenhum outro membro normal pode ver suas dúvidas ou as respostas que você receber.
          </div>
        </div>
      )}

      {/* Cards de Métricas para Diretório / Super Admin */}
      {canManageDoubts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div 
            onClick={() => setStatusFilter('todas')}
            className={`p-4 border transition-all cursor-pointer ${
              statusFilter === 'todas' 
                ? 'bg-[rgba(255,255,255,0.06)] border-[var(--color-ink)]' 
                : 'bg-[rgba(255,255,255,0.02)] border-[var(--color-ink-faint)] hover:border-gray-600'
            }`}
          >
            <div className="text-[10px] text-[var(--color-ink-muted)] uppercase font-['Space_Mono'] mb-1">Total de Dúvidas</div>
            <div className="text-2xl font-bold font-['Syne'] text-[var(--color-ink)]">{counts.total}</div>
          </div>
          <div 
            onClick={() => setStatusFilter('pendente')}
            className={`p-4 border transition-all cursor-pointer ${
              statusFilter === 'pendente' 
                ? 'bg-amber-500/10 border-amber-500/60' 
                : 'bg-[rgba(255,255,255,0.02)] border-[var(--color-ink-faint)] hover:border-amber-500/40'
            }`}
          >
            <div className="text-[10px] text-amber-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1">
              <Clock size={12} /> Aguardando Resposta
            </div>
            <div className="text-2xl font-bold font-['Syne'] text-amber-300">{counts.pendentes}</div>
          </div>
          <div 
            onClick={() => setStatusFilter('em_analise')}
            className={`p-4 border transition-all cursor-pointer ${
              statusFilter === 'em_analise' 
                ? 'bg-blue-500/10 border-blue-500/60' 
                : 'bg-[rgba(255,255,255,0.02)] border-[var(--color-ink-faint)] hover:border-blue-500/40'
            }`}
          >
            <div className="text-[10px] text-blue-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1">
              <AlertCircle size={12} /> Em Análise
            </div>
            <div className="text-2xl font-bold font-['Syne'] text-blue-300">{counts.emAnalise}</div>
          </div>
          <div 
            onClick={() => setStatusFilter('respondida')}
            className={`p-4 border transition-all cursor-pointer ${
              statusFilter === 'respondida' 
                ? 'bg-emerald-500/10 border-emerald-500/60' 
                : 'bg-[rgba(255,255,255,0.02)] border-[var(--color-ink-faint)] hover:border-emerald-500/40'
            }`}
          >
            <div className="text-[10px] text-emerald-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1">
              <CheckCircle2 size={12} /> Respondidas
            </div>
            <div className="text-2xl font-bold font-['Syne'] text-emerald-300">{counts.respondidas}</div>
          </div>
        </div>
      )}

      {/* Barra de Filtros e Busca */}
      <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={canManageDoubts ? "Buscar por membro, e-mail, assunto ou conteúdo..." : "Buscar em suas dúvidas..."}
            className="w-full bg-[rgba(0,0,0,0.3)] border border-[var(--color-ink-faint)] pl-10 pr-4 py-2.5 text-xs text-[var(--color-ink)] focus:border-emerald-500 outline-none font-['Space_Mono']"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro de Status */}
          <div className="flex items-center gap-1 bg-[rgba(0,0,0,0.3)] border border-[var(--color-ink-faint)] px-2 py-1.5 text-xs">
            <Filter size={14} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-gray-200 outline-none font-['Space_Mono'] text-xs cursor-pointer"
            >
              <option value="todas" className="bg-gray-900">Todos os Status</option>
              <option value="pendente" className="bg-gray-900">Aguardando Resposta</option>
              <option value="em_analise" className="bg-gray-900">Em Análise</option>
              <option value="respondida" className="bg-gray-900">Respondidas</option>
            </select>
          </div>

          {/* Filtro de Categoria */}
          <div className="flex items-center gap-1 bg-[rgba(0,0,0,0.3)] border border-[var(--color-ink-faint)] px-2 py-1.5 text-xs">
            <Tag size={14} className="text-gray-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-gray-200 outline-none font-['Space_Mono'] text-xs cursor-pointer"
            >
              <option value="todas" className="bg-gray-900">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c} value={c} className="bg-gray-900">{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Dúvidas */}
      {loading ? (
        <div className="p-12 text-center text-[var(--color-ink-muted)] font-['Space_Mono'] text-xs border border-[var(--color-ink-faint)]">
          Carregando mensagens e dúvidas...
        </div>
      ) : filteredDoubts.length === 0 ? (
        <div className="p-12 text-center border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.01)] space-y-3">
          <HelpCircle size={40} className="mx-auto text-[var(--color-ink-muted)] opacity-40" />
          <h3 className="text-lg font-['Syne'] font-bold text-[var(--color-ink)]">
            {doubts.length === 0 ? 'Nenhuma dúvida registrada ainda' : 'Nenhuma dúvida encontrada para os filtros selecionados'}
          </h3>
          <p className="text-xs text-[var(--color-ink-muted)] font-['Space_Mono'] max-w-md mx-auto">
            {canManageDoubts 
              ? 'Quando um membro da LAJE tirar uma dúvida com o Diretório, ela aparecerá aqui com o nome do membro para resposta.' 
              : 'Você ainda não enviou dúvidas para o Diretório. Fique à vontade para clicar em "Tirar Dúvida" sempre que precisar de ajuda.'}
          </p>
          {!canManageDoubts && doubts.length === 0 && (
            <button
              onClick={() => setIsNewDoubtModalOpen(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] uppercase"
            >
              <Plus size={14} /> Fazer Primeira Pergunta
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDoubts.map((doubt) => {
            const isPending = doubt.status === 'pendente';
            const isInAnalysis = doubt.status === 'em_analise';
            const isAnswered = doubt.status === 'respondida';
            const isAuthor = doubt.userId === currentUserUid;

            return (
              <div
                key={doubt.id}
                className={`p-5 border transition-all duration-200 ${
                  isPending 
                    ? 'border-amber-500/40 bg-amber-500/[0.02]' 
                    : isInAnalysis 
                    ? 'border-blue-500/40 bg-blue-500/[0.02]' 
                    : 'border-emerald-500/30 bg-[rgba(255,255,255,0.015)]'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Badge de Status */}
                      {isPending && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-['Space_Mono'] uppercase tracking-wider font-bold">
                          <Clock size={11} /> Aguardando Diretório
                        </span>
                      )}
                      {isInAnalysis && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] font-['Space_Mono'] uppercase tracking-wider font-bold">
                          <AlertCircle size={11} /> Em Análise
                        </span>
                      )}
                      {isAnswered && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-['Space_Mono'] uppercase tracking-wider font-bold">
                          <CheckCircle2 size={11} /> Respondida pelo Diretório
                        </span>
                      )}

                      {/* Categoria */}
                      {doubt.category && (
                        <span className="px-2 py-0.5 bg-gray-800 text-gray-300 text-[10px] font-['Space_Mono'] uppercase">
                          {doubt.category}
                        </span>
                      )}

                      {/* Prioridade */}
                      {doubt.priority && doubt.priority !== 'Normal' && (
                        <span className="px-2 py-0.5 bg-red-950/40 text-red-400 border border-red-500/30 text-[10px] font-['Space_Mono'] uppercase font-bold">
                          {doubt.priority}
                        </span>
                      )}

                      <span className="text-[10px] text-gray-500 font-['Space_Mono'] flex items-center gap-1">
                        <Calendar size={11} />
                        {new Date(doubt.createdAt).toLocaleDateString('pt-BR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>

                    <h3 className="text-base sm:text-lg font-bold font-['Syne'] text-[var(--color-ink)]">
                      {doubt.title}
                    </h3>

                    {/* Identificação do Membro (aparece o nome do membro que tirou a dúvida) */}
                    <div className="p-2.5 bg-black/40 border border-gray-800/80 rounded flex items-center justify-between flex-wrap gap-2 text-xs font-['Space_Mono']">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                          {doubt.authorName?.[0]?.toUpperCase() || 'M'}
                        </div>
                        <div>
                          <span className="font-bold text-gray-200">
                            Membro: {doubt.authorName}
                          </span>
                          {canManageDoubts && (
                            <span className="text-gray-400 text-[11px] ml-2">
                              ({doubt.authorEmail})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-gray-400">
                        {doubt.authorRole && (
                          <span className="text-emerald-400/90 font-medium">
                            {doubt.authorRole}
                          </span>
                        )}
                        {doubt.authorDiscord && (
                          <span className="text-indigo-300">
                            Discord: {doubt.authorDiscord}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Texto da Dúvida */}
                    <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap leading-relaxed pt-1">
                      {doubt.description}
                    </p>

                    {/* Resposta do Diretório (Se já houver) */}
                    {doubt.response && (
                      <div className="mt-4 p-4 bg-emerald-950/30 border-l-4 border-emerald-500 rounded-r space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] font-['Space_Mono']">
                          <div className="flex items-center gap-1.5 text-emerald-300 font-bold uppercase">
                            <Shield size={14} className="text-emerald-400" />
                            <span>Resposta Oficial: {doubt.answeredByRole || 'Membro do Diretório'} ({doubt.answeredBy})</span>
                          </div>
                          {doubt.answeredAt && (
                            <span className="text-gray-400">
                              {new Date(doubt.answeredAt).toLocaleDateString('pt-BR', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-emerald-100 whitespace-pre-wrap leading-relaxed font-sans">
                          {doubt.response}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex sm:flex-col items-center gap-2 self-end sm:self-start shrink-0 pt-2 sm:pt-0">
                    {/* Botão Responder (Super Admin e Diretório) */}
                    {canManageDoubts && (
                      <button
                        onClick={() => {
                          setSelectedDoubtForAnswer(doubt);
                          setResponseText(doubt.response || '');
                          setResponseStatus(doubt.status === 'respondida' ? 'respondida' : 'respondida');
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-['Space_Mono'] uppercase font-bold transition-colors cursor-pointer"
                        title={doubt.response ? "Atualizar resposta do Diretório" : "Responder ao membro"}
                      >
                        <MessageCircle size={14} />
                        <span>{doubt.response ? 'Editar Resposta' : 'Responder'}</span>
                      </button>
                    )}

                    {/* Excluir (Autor se pendente, ou Diretório/Super Admin) */}
                    {(canManageDoubts || (isAuthor && isPending)) && (
                      <button
                        onClick={() => handleDeleteDoubt(doubt)}
                        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="Excluir dúvida"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Tirar Nova Dúvida (Qualquer Membro) */}
      {isNewDoubtModalOpen && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => !isSubmittingDoubt && setIsNewDoubtModalOpen(false)}
        >
          <div 
            className="bg-[#121216] border border-emerald-500/40 w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-4 border-b border-gray-800 mb-5">
              <div>
                <span className="text-[10px] text-emerald-400 font-['Space_Mono'] uppercase tracking-wider font-bold block mb-1">
                  Contato Direto com Membros do Diretório
                </span>
                <h2 className="text-xl font-bold font-['Syne'] text-white">
                  Tirar Nova Dúvida
                </h2>
                <p className="text-xs text-gray-400 font-['Space_Mono'] mt-1">
                  Sua mensagem é estritamente confidencial e será respondida pelos Membros do Diretório.
                </p>
              </div>
              <button
                onClick={() => !isSubmittingDoubt && setIsNewDoubtModalOpen(false)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateDoubt} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                    Categoria
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.4)] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 font-['Space_Mono']"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c} className="bg-gray-900">{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                    Prioridade
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full bg-[rgba(0,0,0,0.4)] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 font-['Space_Mono']"
                  >
                    <option value="Normal" className="bg-gray-900">Normal</option>
                    <option value="Alta" className="bg-gray-900">Alta</option>
                    <option value="Urgente" className="bg-gray-900">Urgente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  Assunto da Dúvida *
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Como funciona a validação de horas nos projetos?"
                  maxLength={300}
                  required
                  className="w-full bg-[rgba(0,0,0,0.4)] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 font-['Space_Mono']"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  Descrição Detalhada *
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Explique sua dúvida com o máximo de detalhes possível para que o Diretório possa lhe orientar..."
                  rows={6}
                  maxLength={5000}
                  required
                  className="w-full bg-[rgba(0,0,0,0.4)] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 leading-relaxed font-sans"
                />
                <span className="text-[10px] text-gray-500 font-['Space_Mono'] block text-right mt-1">
                  {newDescription.length}/5000 caracteres
                </span>
              </div>

              <div className="p-3 bg-black/40 border border-gray-800 text-[11px] text-gray-400 font-['Space_Mono'] flex items-center justify-between">
                <span>Remetente: <strong className="text-emerald-400">{currentUserName || currentUserEmail}</strong></span>
                <span>Visibilidade: <strong className="text-gray-200">Apenas Diretório</strong></span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsNewDoubtModalOpen(false)}
                  disabled={isSubmittingDoubt}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white font-['Space_Mono'] uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDoubt}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  <Send size={14} />
                  <span>{isSubmittingDoubt ? 'Enviando...' : 'Enviar Dúvida'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Responder Dúvida (Super Admin & Membro do Diretório) */}
      {selectedDoubtForAnswer && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
          onClick={() => !isSubmittingResponse && setSelectedDoubtForAnswer(null)}
        >
          <div 
            className="bg-[#121216] border border-emerald-500/40 w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-4 border-b border-gray-800 mb-5">
              <div>
                <span className="text-[10px] text-emerald-400 font-['Space_Mono'] uppercase tracking-wider font-bold block mb-1">
                  Resposta do {isSuperAdmin ? 'Super Admin' : 'Membro do Diretório'}
                </span>
                <h2 className="text-xl font-bold font-['Syne'] text-white">
                  Responder Dúvida do Membro
                </h2>
              </div>
              <button
                onClick={() => !isSubmittingResponse && setSelectedDoubtForAnswer(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Resumo da Dúvida */}
            <div className="p-3.5 bg-black/50 border border-gray-800 rounded mb-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-['Space_Mono']">
                <span className="text-emerald-400 font-bold">
                  Membro: {selectedDoubtForAnswer.authorName}
                </span>
                <span className="text-gray-400">
                  {selectedDoubtForAnswer.authorEmail}
                </span>
              </div>
              <h4 className="text-sm font-bold text-white font-['Syne']">
                {selectedDoubtForAnswer.title}
              </h4>
              <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                {selectedDoubtForAnswer.description}
              </p>
            </div>

            <form onSubmit={handleSendResponse} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  Status após a resposta
                </label>
                <select
                  value={responseStatus}
                  onChange={(e) => setResponseStatus(e.target.value as any)}
                  className="w-full bg-[rgba(0,0,0,0.4)] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 font-['Space_Mono']"
                >
                  <option value="respondida" className="bg-gray-900">Respondida (Concluída)</option>
                  <option value="em_analise" className="bg-gray-900">Em Análise (Ainda em processamento)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  Resposta Oficial do Diretório *
                </label>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Digite aqui as orientações e esclarecimentos para o membro..."
                  rows={7}
                  maxLength={5000}
                  required
                  className="w-full bg-[rgba(0,0,0,0.4)] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 leading-relaxed font-sans"
                />
                <span className="text-[10px] text-gray-500 font-['Space_Mono'] block text-right mt-1">
                  {responseText.length}/5000 caracteres
                </span>
              </div>

              <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 text-[11px] text-emerald-300 font-['Space_Mono']">
                Assinando como: <strong>{isSuperAdmin ? 'Super Admin' : 'Membro do Diretório'} ({currentUserName || currentUserEmail})</strong>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setSelectedDoubtForAnswer(null)}
                  disabled={isSubmittingResponse}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white font-['Space_Mono'] uppercase"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResponse}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  <Send size={14} />
                  <span>{isSubmittingResponse ? 'Salvando...' : 'Enviar Resposta ao Membro'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
