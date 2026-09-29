import { useState, ChangeEvent, FormEvent, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, setDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getProjectDeadlines, getProjectDetails, getProjectNames, handleFirestoreError, OperationType } from '../lib/utils';
import { logAuditAction } from '../lib/audit';
import { CheckCircle, Loader2, Send, ChevronDown, Check, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { exportDetailedMemberPDF } from '../lib/exportDetailedMemberPDF';

const AVAILABLE_ROLES = [
  'Programação',
  'Arte',
  'Game Design',
  'Som',
  'Produção',
  'Marketing',
  'RH'
];

interface FormProps {
  user: User | null;
  token: string;
}

export default function Form({ user, token }: FormProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [existingResponse, setExistingResponse] = useState<any>(null);
  const [selfResponse, setSelfResponse] = useState<any>(null);
  const [allResponses, setAllResponses] = useState<any[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('me');
  const [fetchingExisting, setFetchingExisting] = useState(true);

  const isSuperAdmin = user?.email?.toLowerCase().trim() === 'isadora.mlima@ufpe.br' || 
    (user?.email?.toLowerCase().trim().startsWith('isadora.mlima@ufpe') ?? false) ||
    user?.email?.toLowerCase().trim() === 'isadorasdml@gmail.com';

  const [formData, setFormData] = useState({
    name: user?.displayName || '',
    birthday: '',
    discordUser: '',
    course: '',
    period: '',
    collegeFocus: 3,
    leagueRole: 'Programação',
    leagueFocus: 3,
    weeklyHours: '4h',
    roleFocus: '',
    learningFocus: '',
    isInProject: 'Sim',
    currentProjects: '',
    projectDetails: {} as Record<string, string>,
    projectDeadlines: {} as Record<string, string>,
    notInProjectStatus: 'Quero entrar em um projeto e estou procurando',
    interestedProjects: '',
    attendancePreference: 'Sim, sem problema',
    microtasksInterest: 'Sim, me avisem quando abrir',
    priority: 'Média',
    progress: 0,
    deadline: '',
  });

  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  const loadFormData = (data: any) => {
    setFormData({
      name: data.name || '',
      birthday: data.birthday || '',
      discordUser: data.discordUser || '',
      course: data.course || '',
      period: data.period || '',
      collegeFocus: data.collegeFocus ?? 3,
      leagueRole: data.leagueRole || 'Programação',
      leagueFocus: data.leagueFocus ?? 3,
      weeklyHours: data.weeklyHours || '4h',
      roleFocus: data.roleFocus || '',
      learningFocus: data.learningFocus || '',
      isInProject: data.isInProject || (data.currentProjects ? 'Sim' : 'Não'),
      currentProjects: data.currentProjects || '',
      projectDetails: getProjectDetails(data),
      projectDeadlines: getProjectDeadlines(data),
      notInProjectStatus: data.notInProjectStatus || 'Quero entrar em um projeto e estou procurando',
      interestedProjects: data.interestedProjects || '',
      attendancePreference: data.attendancePreference || 'Sim, sem problema',
      microtasksInterest: data.microtasksInterest || 'Sim, me avisem quando abrir',
      priority: data.priority || 'Média',
      progress: data.progress ?? 0,
      deadline: data.deadline || '',
    });
  };

  const handleSwitchMember = (targetId: string) => {
    setSelectedMemberId(targetId);
    if (targetId === 'me') {
      if (selfResponse) {
        setExistingResponse(selfResponse);
        loadFormData(selfResponse);
      } else {
        setExistingResponse(null);
        setFormData({
          name: user?.displayName || '',
          birthday: '',
          discordUser: '',
          course: '',
          period: '',
          collegeFocus: 3,
          leagueRole: 'Programação',
          leagueFocus: 3,
          weeklyHours: '4h',
          roleFocus: '',
          learningFocus: '',
          isInProject: 'Sim',
          currentProjects: '',
          projectDetails: {},
          projectDeadlines: {},
          notInProjectStatus: 'Quero entrar em um projeto e estou procurando',
          interestedProjects: '',
          attendancePreference: 'Sim, sem problema',
          microtasksInterest: 'Sim, me avisem quando abrir',
          priority: 'Média',
          progress: 0,
          deadline: '',
        });
      }
    } else {
      const target = allResponses.find(r => r.id === targetId);
      if (target) {
        setExistingResponse(target);
        loadFormData(target);
      }
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setIsRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchExisting = async () => {
      if (!user) return;
      try {
        let foundDoc: any = null;
        // 1. Tentar buscar pelo UID autenticado do usuário
        const qUserId = query(collection(db, 'responses'), where('userId', '==', user.uid));
        const snapUserId = await getDocs(qUserId);
        if (!snapUserId.empty) {
          foundDoc = { id: snapUserId.docs[0].id, ...snapUserId.docs[0].data() };
        } else if (user.email) {
          // 2. Fallback essencial por e-mail: caso o membro tenha sido cadastrado via Dashboard ou lista
          const cleanEmail = user.email.toLowerCase().trim();
          const qEmail = query(collection(db, 'responses'), where('email', '==', cleanEmail));
          const snapEmail = await getDocs(qEmail);
          if (!snapEmail.empty) {
            foundDoc = { id: snapEmail.docs[0].id, ...snapEmail.docs[0].data() };
            // Vincular de forma permanente o UID do Google autenticado a essa resposta
            await updateDoc(doc(db, 'responses', foundDoc.id), { userId: user.uid }).catch(() => {});
          }
        }

        if (foundDoc) {
          setExistingResponse(foundDoc);
          setSelfResponse(foundDoc);
          loadFormData(foundDoc);
        }

        if (isSuperAdmin) {
          try {
            const allSnap = await getDocs(collection(db, 'responses'));
            const list: any[] = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            list.sort((a: any, b: any) => (String(a.name || '')).localeCompare(String(b.name || '')));
            setAllResponses(list);
          } catch (e) {
            console.error("Failed to load all responses for super admin", e);
          }
        }
      } catch (err) {
        console.error("Failed to fetch existing response", err);
      } finally {
        setFetchingExisting(false);
      }
    };
    fetchExisting();
  }, [user, isSuperAdmin]);

  const requestEdit = async () => {
    if (!existingResponse || !token || !user) return;
    try {
      setLoading(true);
      await updateDoc(doc(db, 'responses', existingResponse.id), {
        editRequestStatus: 'pending'
      });
      setExistingResponse({ ...existingResponse, editRequestStatus: 'pending' });
      toast.success('Solicitação de edição enviada para o RH!');
      
      // Notify HR
      const rhEmails = ['isadora.mlima@ufpe.br'];
      
      if (rhEmails.length > 0) {
        const emailContent = [
          'Content-Type: text/html; charset="UTF-8"\n',
          'MIME-Version: 1.0\n',
          `Bcc: ${rhEmails.join(',')}\n`,
          `Subject: Pedido de Edição de Formulário: ${user.displayName || user.email}\n\n`,
          `<div style="font-family: sans-serif; padding: 24px;">
            <h2>Pedido de Edição</h2>
            <p>O membro <strong>${user.displayName || user.email}</strong> solicitou permissão para editar seu formulário.</p>
            <p>Acesse o Dashboard no sistema LAJE HR para aprovar ou rejeitar a solicitação.</p>
          </div>`
        ].join('');

        const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        try {
          await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ raw: base64EncodedEmail }),
          });
        } catch (emailErr) {
          console.error("Failed to send notification email", emailErr);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao solicitar edição');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'range' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.leagueRole || formData.leagueRole.trim() === '') {
      toast.error('Selecione pelo menos uma função atual na liga');
      return;
    }
    
    setLoading(true);
    setErrorMsg('');
    try {
      const targetEmail = (selectedMemberId === 'me' ? user.email : (existingResponse?.email || user.email) || '').toLowerCase().trim();
      if (!targetEmail) {
        toast.error('E-mail do usuário não identificado');
        setLoading(false);
        return;
      }

      // 1. Verificar se o e-mail do usuário já existe na coleção 'responses' antes de permitir a submissão
      let targetDoc = existingResponse;
      if (!targetDoc && selectedMemberId === 'me') {
        const emailCheckQ = query(collection(db, 'responses'), where('email', '==', targetEmail));
        const emailCheckSnap = await getDocs(emailCheckQ);
        if (!emailCheckSnap.empty) {
          const found: any = { id: emailCheckSnap.docs[0].id, ...emailCheckSnap.docs[0].data() };
          if (!isSuperAdmin && !found.editAuthorized) {
            setExistingResponse(found);
            loadFormData(found);
            toast.error('Este e-mail já possui um formulário respondido no sistema!');
            setErrorMsg('Já existe um registro cadastrado para este e-mail na coleção responses. Não são permitidos múltiplos registros.');
            setLoading(false);
            return;
          }
          targetDoc = found;
        } else {
          // Checar também pelo UID do usuário
          const uidCheckQ = query(collection(db, 'responses'), where('userId', '==', user.uid));
          const uidCheckSnap = await getDocs(uidCheckQ);
          if (!uidCheckSnap.empty) {
            targetDoc = { id: uidCheckSnap.docs[0].id, ...uidCheckSnap.docs[0].data() };
          }
        }
      } else if (existingResponse && !isSuperAdmin && !existingResponse.editAuthorized) {
        toast.error('Edição não autorizada. Solicite permissão ao Diretório.');
        setLoading(false);
        return;
      }

      // Se ainda não tiver targetDoc (ou seja, novo cadastro), fazer a verificação final de duplicação por e-mail
      if (!targetDoc) {
        const finalDuplicateCheck = await getDocs(query(collection(db, 'responses'), where('email', '==', targetEmail)));
        if (!finalDuplicateCheck.empty) {
          const existingData: any = { id: finalDuplicateCheck.docs[0].id, ...finalDuplicateCheck.docs[0].data() };
          setExistingResponse(existingData);
          loadFormData(existingData);
          toast.error('Este e-mail já possui um formulário cadastrado no sistema!');
          setErrorMsg('Já existe um registro com este e-mail na coleção responses. Múltiplos registros foram impedidos.');
          setLoading(false);
          return;
        }
      }

      const responseData = {
        userId: user.uid,
        email: targetEmail,
        name: formData.name,
        birthday: formData.birthday || '',
        discordUser: formData.discordUser || '',
        course: formData.course,
        period: formData.period,
        collegeFocus: Number(formData.collegeFocus || 0),
        leagueRole: formData.leagueRole,
        leagueFocus: Number(formData.leagueFocus || 0),
        weeklyHours: formData.weeklyHours || '',
        roleFocus: formData.roleFocus,
        learningFocus: formData.learningFocus || '',
        isInProject: formData.isInProject || 'Sim',
        currentProjects: formData.currentProjects || '',
        projectDetails: formData.projectDetails,
        projectDeadlines: formData.projectDeadlines,
        notInProjectStatus: formData.notInProjectStatus || '',
        interestedProjects: formData.interestedProjects || '',
        attendancePreference: formData.attendancePreference || '',
        microtasksInterest: formData.microtasksInterest || '',
        priority: formData.priority || 'Média',
        progress: Number(formData.progress || 0),
        deadline: Object.values(formData.projectDeadlines).find(Boolean) || formData.deadline || '',
        status: 'Ativo' // ensure it remains active
      };

      if (targetDoc) {
        const updatePayload = {
          ...responseData,
          userId: user.uid,
          email: user.email || targetDoc.email || '',
          lastEditedAt: Date.now(),
          lastEditedBy: user.email || 'isadora.mlima@ufpe.br',
          editAuthorized: isSuperAdmin ? true : false,
          editRequestStatus: null
        };

        await updateDoc(doc(db, 'responses', targetDoc.id), updatePayload);

        // Record audit log for data update
        const changedFields: string[] = [];
        if (targetDoc.name !== responseData.name) changedFields.push(`Nome`);
        if (targetDoc.birthday !== responseData.birthday) changedFields.push(`Aniversário`);
        if (targetDoc.course !== responseData.course) changedFields.push(`Curso`);
        if (targetDoc.period !== responseData.period) changedFields.push(`Período`);
        if (targetDoc.leagueRole !== responseData.leagueRole) changedFields.push(`Área`);
        if (targetDoc.weeklyHours !== responseData.weeklyHours) changedFields.push(`Horas`);
        if (targetDoc.currentProjects !== responseData.currentProjects) changedFields.push(`Projetos`);

        await logAuditAction({
          action: 'Atualização de Dados',
          targetMemberId: targetDoc.id,
          targetMemberName: responseData.name,
          targetMemberEmail: targetDoc.email || responseData.email,
          details: isSuperAdmin && selectedMemberId !== 'me'
            ? `Respostas de ${responseData.name} foram editadas no formulário por isadora.mlima@ufpe`
            : changedFields.length > 0 
            ? `Membro atualizou dados cadastrais (${changedFields.join(', ')})`
            : `Membro atualizou dados do formulário`,
          previousValue: JSON.stringify({
            name: targetDoc.name,
            course: targetDoc.course,
            period: targetDoc.period,
            leagueRole: targetDoc.leagueRole,
            weeklyHours: targetDoc.weeklyHours,
            currentProjects: targetDoc.currentProjects,
          }),
          newValue: JSON.stringify({
            name: responseData.name,
            course: responseData.course,
            period: responseData.period,
            leagueRole: responseData.leagueRole,
            weeklyHours: responseData.weeklyHours,
            currentProjects: responseData.currentProjects,
          }),
          performedByEmail: user.email || 'isadora.mlima@ufpe.br',
          performedByName: user.displayName || user.email || 'Isadora',
        });

        toast.success(`Formulário de ${responseData.name || 'membro'} atualizado com sucesso!`);
        const updatedDoc = { ...targetDoc, ...updatePayload };
        setExistingResponse(updatedDoc);
        if (selectedMemberId === 'me') {
          setSelfResponse(updatedDoc);
        }
        setAllResponses(prev => prev.map(m => m.id === targetDoc.id ? updatedDoc : m));
      } else {
        // Usar o próprio UID do usuário autenticado como ID do documento para garantir idempotência absoluta
        const newResponseId = user.uid;
        await setDoc(doc(db, 'responses', newResponseId), {
          ...responseData,
          createdAt: Date.now()
        });
        toast.success('Formulário enviado com sucesso!');
      }

      setSuccess(true);
    } catch (error) {
      console.error('Error submitting form', error);
      setErrorMsg(error instanceof Error ? error.message : 'Erro ao enviar formulário. Verifique o console.');
      toast.error('Erro ao enviar formulário.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingExisting) {
    return (
      <div className="w-full flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-2xl mx-auto mt-12 p-8 border border-emerald-500/20 bg-emerald-500/10 text-center flex flex-col items-center">
        <CheckCircle size={64} className="text-emerald-500 mb-6" />
        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Dados salvos</h2>
        <p className="text-gray-400 font-medium">Seu cadastro foi atualizado no RH da LAJE.</p>
        <button 
          type="button"
          onClick={() => {
            setSuccess(false);
            if (existingResponse) {
               window.location.reload();
            }
          }}
          className="mt-8 px-6 py-2.5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] text-[var(--color-ink)] font-semibold hover:bg-[rgba(255,255,255,0.1)] transition-colors text-sm cursor-pointer"
        >
          Voltar ao cadastro
        </button>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const isReadOnly = existingResponse && !existingResponse.editAuthorized && !isSuperAdmin;

  const selectedRoles: string[] = formData.leagueRole
    ? formData.leagueRole.split(',').map(r => r.trim()).filter(Boolean)
    : [];

  const toggleRole = (role: string) => {
    if (isReadOnly) return;
    let newRoles: string[];
    if (selectedRoles.includes(role)) {
      newRoles = selectedRoles.filter(r => r !== role);
    } else {
      newRoles = [...selectedRoles, role];
    }
    setFormData(prev => ({
      ...prev,
      leagueRole: newRoles.join(', ')
    }));
  };

  const removeRole = (role: string) => {
    if (isReadOnly) return;
    const newRoles = selectedRoles.filter(r => r !== role);
    setFormData(prev => ({
      ...prev,
      leagueRole: newRoles.join(', ')
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto space-y-8 pb-12">
      {isSuperAdmin && (
        <div className="w-full max-w-full p-5 bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/40 shadow-lg space-y-3 mb-6 overflow-hidden box-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <h4 className="text-sm font-['Syne'] font-bold text-emerald-300 uppercase tracking-wider">
                Acesso Especial: Edição de Respostas do Formulário
              </h4>
            </div>
            <span className="text-[10px] font-['Space_Mono'] uppercase px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Autorizado: isadora.mlima@ufpe.br
            </span>
          </div>
          <p className="text-xs text-gray-300 font-medium">
            Você tem privilégios totais para editar qualquer resposta enviada no formulário. Selecione abaixo a resposta do membro que deseja alterar:
          </p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1 w-full min-w-0 max-w-full">
            <label className="text-xs font-semibold uppercase text-emerald-400 font-['Space_Mono'] whitespace-nowrap shrink-0">
              Membro selecionado:
            </label>
            <select
              value={selectedMemberId}
              onChange={(e) => handleSwitchMember(e.target.value)}
              className="flex-1 w-full min-w-0 max-w-full bg-[#121216] border border-emerald-500/50 text-emerald-200 text-xs p-2.5 outline-none font-['Space_Mono'] cursor-pointer focus:border-emerald-400 truncate"
            >
              <option value="me">Minha Resposta ({user?.email})</option>
              {allResponses.length > 0 && (
                <optgroup label={`Respostas dos Membros Cadastrados (${allResponses.length})`}>
                  {allResponses.map((r) => (
                    <option key={r.id} value={r.id} className="bg-[#121216] text-white">
                      {r.name || 'Sem nome'} — {r.leagueRole || 'Sem área'} ({r.email || 'sem e-mail'})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      )}

      {existingResponse && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] mb-8">
          <div>
            <h3 className="font-['Syne'] uppercase text-[var(--color-ink)] font-bold">Status do Formulário</h3>
            <p className="font-['Space_Mono'] uppercase text-[0.7rem] text-[var(--color-ink-muted)]">
              {isSuperAdmin
                ? `Modo Administrador - Edição Livre Ativa (${selectedMemberId === 'me' ? 'Meu Formulário' : (formData.name || 'Membro')})`
                : isReadOnly
                ? 'Somente Leitura - Aguardando ou requer autorização'
                : 'Modo de Edição Autorizado'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                try {
                  exportDetailedMemberPDF({
                    ...formData,
                    email: user?.email || '',
                    createdAt: existingResponse.createdAt,
                    lastEditedAt: existingResponse.lastEditedAt,
                    status: existingResponse.status || 'Ativo',
                    editRequestStatus: existingResponse.editRequestStatus,
                    editAuthorized: existingResponse.editAuthorized,
                    editHistory: existingResponse.editHistory
                  });
                  toast.success('Ficha cadastral em PDF gerada!');
                } catch (err) {
                  console.error(err);
                  toast.error('Erro ao gerar PDF');
                }
              }}
              className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
              title="Baixar cópia detalhada em PDF desta resposta"
            >
              <FileText className="w-3.5 h-3.5" />
              Baixar Ficha em PDF
            </button>
            {isReadOnly && existingResponse.editRequestStatus === 'pending' ? (
              <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Aguardando RH
              </div>
            ) : isReadOnly ? (
              <button 
                type="button"
                onClick={requestEdit}
                disabled={loading}
                className="px-4 py-2 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--color-ink)] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Solicitar Edição
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Dados Pessoais */}
      <section className="p-8 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--color-accent)]" />
        <h3 className="text-[var(--color-ink)] text-lg font-bold mb-6 flex items-center gap-2 uppercase tracking-[-0.04em] font-['Syne']">
          <span className="text-[var(--color-bg-dark)] bg-[var(--color-accent)] px-2 py-1 text-sm font-['Space_Mono']">01</span> Dados Pessoais & Acadêmicos
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-semibold uppercase text-gray-400">Nome do Membro</label>
            <input 
              required 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              placeholder="Ex: Maria Silva" 
              disabled={isReadOnly}
              className={`w-full h-11 bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] px-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-400">Usuário do Discord</label>
            <input 
              required 
              name="discordUser" 
              value={formData.discordUser} 
              onChange={e => setFormData(prev => ({ ...prev, discordUser: e.target.value.replace(/^@/, '') }))} 
              placeholder="usuario_discord" 
              disabled={isReadOnly}
              className={`w-full h-11 bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] px-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-400">Data de Aniversário</label>
            <input 
              type="date" 
              name="birthday" 
              value={formData.birthday} 
              onChange={handleChange} 
              disabled={isReadOnly}
              className={`w-full h-11 bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] px-3 outline-none transition-all [color-scheme:dark] ${isReadOnly ? 'opacity-50' : ''}`} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-400">Curso</label>
            <input 
              required 
              name="course" 
              value={formData.course} 
              onChange={handleChange} 
              placeholder="Ex: Ciência da Computação" 
              disabled={isReadOnly}
              className={`w-full h-11 bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] px-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} 
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-400">Período</label>
            <input 
              required 
              name="period" 
              value={formData.period} 
              onChange={handleChange} 
              placeholder="Ex: 5º Período" 
              disabled={isReadOnly}
              className={`w-full h-11 bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] px-3 outline-none transition-all ${isReadOnly ? 'opacity-50' : ''}`} 
            />
          </div>
        </div>
      </section>

      {/* Dados da Liga */}
      <section className="p-8 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--color-accent)]" />
        <h3 className="text-[var(--color-ink)] text-lg font-bold mb-6 flex items-center gap-2 uppercase tracking-[-0.04em] font-['Syne']">
          <span className="text-[var(--color-bg-dark)] bg-[var(--color-accent)] px-2 py-1 text-sm font-['Space_Mono']">02</span> Dados da Liga
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase text-gray-500">
                Função Atual
              </label>
              <span className="text-[10px] text-[var(--color-accent)] font-medium font-['Space_Mono']">
                {selectedRoles.length > 1 ? `${selectedRoles.length} selecionadas` : 'Escolha uma ou mais'}
              </span>
            </div>
            
            <div className="relative" ref={roleDropdownRef}>
              <button
                type="button"
                id="leagueRole"
                aria-label="Selecionar função atual"
                onClick={() => !isReadOnly && setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                disabled={isReadOnly}
                className={`w-full min-h-[48px] bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5 outline-none transition-all flex items-center justify-between gap-2 text-left cursor-pointer ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex flex-wrap gap-1.5 items-center flex-1">
                  {selectedRoles.length === 0 ? (
                    <span className="text-gray-500 text-sm">Selecione uma ou mais funções...</span>
                  ) : (
                    selectedRoles.map(role => (
                      <span
                        key={role}
                        className="inline-flex items-center gap-1.5 bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30 text-[var(--color-accent)] text-xs font-semibold px-2 py-0.5 rounded-sm"
                      >
                        <span>{role}</span>
                        {!isReadOnly && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeRole(role);
                            }}
                            className="hover:text-white transition-colors cursor-pointer text-xs leading-none ml-0.5 font-bold"
                            title={`Remover ${role}`}
                          >
                            ×
                          </span>
                        )}
                      </span>
                    ))
                  )}
                </div>
                <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 shrink-0 ${isRoleDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isRoleDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-950 border border-[var(--color-ink-faint)] shadow-2xl z-30 p-2 space-y-1 rounded-sm max-h-64 overflow-y-auto">
                  <div className="text-[10px] text-gray-500 uppercase px-2 py-1 font-semibold tracking-wider border-b border-gray-800 mb-1 flex justify-between items-center">
                    <span>Clique para marcar / desmarcar</span>
                    <span className="text-emerald-500 font-bold">{selectedRoles.length} selecionada(s)</span>
                  </div>
                  {AVAILABLE_ROLES.map(role => {
                    const isChecked = selectedRoles.includes(role);
                    return (
                      <div
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer transition-colors ${
                          isChecked 
                            ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)] font-semibold' 
                            : 'text-gray-300 hover:bg-gray-800/80 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by click on parent div
                            className="accent-[var(--color-accent)] cursor-pointer rounded w-4 h-4"
                          />
                          <span>{role}</span>
                        </div>
                        {isChecked && <Check size={16} className="text-[var(--color-accent)]" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <input type="hidden" name="leagueRole" value={formData.leagueRole} />
          </div>
          <div className="space-y-2">
            <label htmlFor="weeklyHours" className="text-xs font-semibold uppercase text-gray-500">
              Dedicação Semanal à Liga (Horas)
            </label>
            <select 
              id="weeklyHours"
              name="weeklyHours" 
              value={formData.weeklyHours} 
              onChange={handleChange} 
              disabled={isReadOnly}
              className={`w-full max-w-full truncate bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all cursor-pointer ${isReadOnly ? 'opacity-50' : ''}`}
            >
              <option className="bg-gray-900 text-gray-200" value="2h">2h</option>
              <option className="bg-gray-900 text-gray-200" value="4h">4h</option>
              <option className="bg-gray-900 text-gray-200" value="6h">6h</option>
              <option className="bg-gray-900 text-gray-200" value="8h">8h</option>
              <option className="bg-gray-900 text-gray-200" value="10h">10h</option>
              <option className="bg-gray-900 text-gray-200" value="+12h">+12h</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 mb-6">
          <label htmlFor="roleFocus" className="text-xs font-semibold uppercase text-gray-500">
            Foco dentro da sua função atual na liga
          </label>
          <textarea 
            id="roleFocus"
            name="roleFocus" 
            value={formData.roleFocus} 
            onChange={handleChange} 
            rows={3} 
            placeholder={`Descreva qual o seu foco dentro da sua atuação em ${formData.leagueRole}...`}
            disabled={isReadOnly}
            className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all resize-none ${isReadOnly ? 'opacity-50' : ''}`} 
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-gray-500">O que você quer focar em aprender agora?</label>
          <textarea required name="learningFocus" value={formData.learningFocus} onChange={handleChange} rows={3} disabled={isReadOnly}
            className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none transition-all resize-none ${isReadOnly ? 'opacity-50' : ''}`} />
        </div>
      </section>

      {/* Projetos & Situação de Entrada na Liga */}
      <section className="p-8 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] relative overflow-hidden space-y-6">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--color-accent)]" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-[var(--color-ink)] text-lg font-bold flex items-center gap-2 uppercase tracking-[-0.04em] font-['Syne']">
            <span className="text-[var(--color-bg-dark)] bg-[var(--color-accent)] px-2 py-1 text-sm font-['Space_Mono']">03</span> Situação em Projetos & Disponibilidade
          </h3>
          <span className="text-xs text-amber-400 font-['Space_Mono']">Inversão do Convite</span>
        </div>

        {/* Pergunta 5: Você está em algum projeto da LAJE hoje? */}
        <div className="p-4 bg-black/30 border border-gray-800 space-y-3">
          <label className="text-xs font-semibold uppercase text-gray-300 font-['Space_Mono'] block">
            5. Você está em algum projeto de jogo da LAJE hoje? *
          </label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs text-white cursor-pointer font-['Space_Mono']">
              <input
                type="radio"
                name="isInProject"
                value="Sim"
                checked={formData.isInProject === 'Sim'}
                onChange={() => setFormData(prev => ({ ...prev, isInProject: 'Sim' }))}
                disabled={isReadOnly}
                className="accent-emerald-500"
              />
              Sim
            </label>
            <label className="flex items-center gap-2 text-xs text-white cursor-pointer font-['Space_Mono']">
              <input
                type="radio"
                name="isInProject"
                value="Não"
                checked={formData.isInProject === 'Não'}
                onChange={() => setFormData(prev => ({ ...prev, isInProject: 'Não' }))}
                disabled={isReadOnly}
                className="accent-emerald-500"
              />
              Não
            </label>
          </div>

          {formData.isInProject === 'Sim' ? (
            <div className="space-y-1.5 pt-2 border-t border-gray-800">
              <label className="text-xs font-semibold uppercase text-gray-400">Em qual(is) projeto(s) você está?</label>
              <input
                required
                name="currentProjects"
                value={formData.currentProjects}
                onChange={handleChange}
                placeholder="Ex: Depois do Espetáculo"
                disabled={isReadOnly}
                className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-3 outline-none text-xs font-['Space_Mono'] ${isReadOnly ? 'opacity-50' : ''}`}
              />
              {getProjectNames(formData.currentProjects).length > 0 && (
                <div className="space-y-2 pt-2">
                  <p className="text-[11px] font-semibold uppercase text-amber-400 font-['Space_Mono']">O que você faz e qual o prazo em cada projeto</p>
                  {getProjectNames(formData.currentProjects).map(project => (
                    <div key={project} className="space-y-2 p-3 bg-black/20 border border-gray-800">
                      <span className="text-xs text-emerald-400 font-semibold block">{project}</span>
                      <textarea
                        rows={2}
                        value={formData.projectDetails[project] || ''}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          projectDetails: { ...prev.projectDetails, [project]: e.target.value }
                        }))}
                        placeholder={`Descreva o que você faz em ${project}...`}
                        disabled={isReadOnly}
                        className={`w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2 outline-none text-xs resize-none ${isReadOnly ? 'opacity-50' : ''}`}
                      />
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="text-[11px] text-gray-400 uppercase font-['Space_Mono'] flex-1">Data limite</label>
                        <input
                          type="date"
                          min={today}
                          value={formData.projectDeadlines[project] || ''}
                          onChange={e => setFormData(prev => ({
                            ...prev,
                            projectDeadlines: { ...prev.projectDeadlines, [project]: e.target.value }
                          }))}
                          disabled={isReadOnly}
                          className={`bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2 outline-none text-xs [color-scheme:dark] ${isReadOnly ? 'opacity-50' : ''}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2 pt-2 border-t border-gray-800">
              <label className="text-xs font-semibold uppercase text-amber-400 font-['Space_Mono'] block">
                Se não está em nenhum projeto, qual frase combina mais com você?
              </label>
              <select
                name="notInProjectStatus"
                value={formData.notInProjectStatus}
                onChange={handleChange}
                disabled={isReadOnly}
                className={`w-full max-w-full truncate bg-[#161619] border border-[var(--color-ink-faint)] text-xs text-gray-200 p-2.5 outline-none font-['Space_Mono'] ${isReadOnly ? 'opacity-50' : ''}`}
              >
                <option value="Quero entrar em um projeto e estou procurando">Quero entrar em um projeto e estou procurando</option>
                <option value="Quero entrar, mas não sei como nem com quem falar">Quero entrar, mas não sei como nem com quem falar</option>
                <option value="Já tentei entrar e não consegui">Já tentei entrar e não consegui</option>
                <option value="Por enquanto prefiro só acompanhar a liga">Por enquanto prefiro só acompanhar a liga</option>
                <option value="Entrei por curiosidade e não pretendo participar de projeto">Entrei por curiosidade e não pretendo participar de projeto</option>
              </select>
            </div>
          )}
        </div>

        {/* Presencialidade & Mural de Tarefas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-400 font-['Space_Mono']">
              10. Dá para você aparecer nos encontros presenciais?
            </label>
            <select
              name="attendancePreference"
              value={formData.attendancePreference}
              onChange={handleChange}
              disabled={isReadOnly}
              className={`w-full max-w-full truncate bg-[#161619] border border-[var(--color-ink-faint)] text-xs text-gray-200 p-2.5 outline-none font-['Space_Mono'] ${isReadOnly ? 'opacity-50' : ''}`}
            >
              <option value="Sim, sem problema">Sim, sem problema</option>
              <option value="Dá, mas depende do dia e do horário">Dá, mas depende do dia e do horário</option>
              <option value="Não consigo, só participo online">Não consigo, só participo online</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-gray-400 font-['Space_Mono']">
              11. Toparia tarefas pequenas e pontuais no Mural?
            </label>
            <select
              name="microtasksInterest"
              value={formData.microtasksInterest}
              onChange={handleChange}
              disabled={isReadOnly}
              className={`w-full max-w-full truncate bg-[#161619] border border-[var(--color-ink-faint)] text-xs text-gray-200 p-2.5 outline-none font-['Space_Mono'] ${isReadOnly ? 'opacity-50' : ''}`}
            >
              <option value="Sim, me avisem quando abrir">Sim, me avisem quando abrir</option>
              <option value="Talvez, depende da tarefa">Talvez, depende da tarefa</option>
              <option value="Prefiro entrar em um projeto inteiro">Prefiro entrar em um projeto inteiro</option>
            </select>
          </div>
        </div>

      </section>

      {errorMsg && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium">
          {errorMsg}
        </div>
      )}

      { !isReadOnly && (
        <div className="flex justify-end pt-4">
          <button 
            disabled={loading}
            type="submit"
            className="flex items-center gap-3 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] border-none font-bold px-10 py-4 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer uppercase font-['Space_Mono']"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Transmitindo...
              </>
            ) : (isSuperAdmin && selectedMemberId !== 'me' ? 'Salvar Alterações do Membro' : 'Submeter Dados')}
          </button>
        </div>
      )}
    </form>
  );
}
