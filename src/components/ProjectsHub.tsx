import { useState, useEffect, useMemo, FormEvent, MouseEvent } from 'react';
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  where,
  orderBy 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { 
  ProjectItem, 
  OpeningItem, 
  TaskItem, 
  ProposalItem, 
  clearAllProjectsAndOpenings
} from '../lib/projects';
import { sendNewProjectNotification, createProjectMailtoLink } from '../lib/workspace';
import { 
  buildProjectEmail, 
  buildOpeningEmail, 
  buildTaskEmail, 
  openManualEmailInBrowser, 
  EmailPayload 
} from '../lib/manualEmail';
import ManualEmailModal from './ManualEmailModal';
import { logAuditAction } from '../lib/audit';
import { 
  Gamepad2, 
  Briefcase, 
  Kanban, 
  Sparkles, 
  Plus, 
  Search, 
  Filter, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  Users, 
  FileText, 
  Send, 
  Calendar, 
  ChevronRight, 
  X, 
  HelpCircle, 
  Check, 
  AlertTriangle,
  Lightbulb,
  Award,
  Layers,
  ArrowRight,
  UserPlus,
  RefreshCw,
  MessageSquare,
  Trash2,
  FolderPlus,
  Mail,
  Edit2,
  UserCheck,
  Crown,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ProjectsHubProps {
  isAdmin?: boolean;
  currentUserEmail?: string;
  currentUserName?: string;
  currentUserRole?: string;
  token?: string;
}

export default function ProjectsHub({ 
  isAdmin = false, 
  currentUserEmail = '', 
  currentUserName = '',
  currentUserRole = '',
  token = ''
}: ProjectsHubProps) {
  const activeEmail = (currentUserEmail || auth.currentUser?.email || '').toLowerCase().trim();
  const isSuperAdminEmail = activeEmail === 'isadora.mlima@ufpe.br' || activeEmail.startsWith('isadora.mlima@ufpe');
  const [isRHMember, setIsRHMember] = useState(false);

  useEffect(() => {
    const checkRH = async () => {
      if (isSuperAdminEmail) {
        setIsRHMember(true);
        return;
      }
      if (currentUserRole && (currentUserRole.toLowerCase().includes('rh') || currentUserRole.toLowerCase().includes('recursos humanos'))) {
        setIsRHMember(true);
        return;
      }
      try {
        const user = auth.currentUser;
        if (user) {
          const q1 = query(collection(db, 'responses'), where('userId', '==', user.uid));
          const snap1 = await getDocs(q1);
          if (!snap1.empty) {
            const r = (snap1.docs[0].data().leagueRole || '').toLowerCase();
            if (r.includes('rh') || r.includes('recursos humanos')) {
              setIsRHMember(true);
              return;
            }
          }
        }
        if (activeEmail) {
          const q2 = query(collection(db, 'responses'), where('email', '==', activeEmail));
          const snap2 = await getDocs(q2);
          if (!snap2.empty) {
            const r = (snap2.docs[0].data().leagueRole || '').toLowerCase();
            if (r.includes('rh') || r.includes('recursos humanos')) {
              setIsRHMember(true);
              return;
            }
          }
        }
      } catch (e) {
        console.error('Error checking RH membership:', e);
      }
    };
    checkRH();
  }, [activeEmail, currentUserRole, isSuperAdminEmail]);

  // Membros do RH, isadora.mlima@ufpe.br e Administradores podem gerenciar e editar jogos
  const canEditGames = isAdmin || isSuperAdminEmail || isRHMember || Boolean(currentUserRole && (currentUserRole.toLowerCase().includes('rh') || currentUserRole.toLowerCase().includes('recursos humanos')));

  const [activeSubTab, setActiveSubTab] = useState<'projetos' | 'vagas' | 'mural' | 'proposta'>('projetos');
  const [loading, setLoading] = useState(true);

  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [openings, setOpenings] = useState<OpeningItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [proposals, setProposals] = useState<ProposalItem[]>([]);

  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<ProposalItem | null>(null);

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectItem | null>(null);
  const [isSavingProjectEdit, setIsSavingProjectEdit] = useState(false);
  const [isNewOpeningModalOpen, setIsNewOpeningModalOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  const [editProjectForm, setEditProjectForm] = useState({
    name: '',
    status: 'em produção' as ProjectItem['status'],
    engine: 'Godot',
    genre: '',
    leader: '',
    leaderDiscord: '',
    responsibleDirector: 'Diretoria de Projetos',
    semester: '2026.2',
    description: '',
    elevatorPitch: '',
    diferencial: '',
    pilares: '',
    targetScope: 'Protótipo jogável neste semestre',
    teamMembers: '',
    coverEmoji: '🎮'
  });

  const [newProjectForm, setNewProjectForm] = useState({
    name: '',
    status: 'em produção' as ProjectItem['status'],
    engine: 'Godot',
    genre: '',
    leader: currentUserName || '',
    leaderDiscord: '',
    responsibleDirector: 'Diretoria de Projetos',
    semester: '2026.2',
    description: '',
    elevatorPitch: '',
    diferencial: '',
    pilares: '',
    targetScope: 'Protótipo jogável neste semestre',
    teamMembers: '',
    coverEmoji: '🎮',
    notifyMembers: true
  });
  const [isSubmittingProject, setIsSubmittingProject] = useState(false);

  const [newOpeningForm, setNewOpeningForm] = useState({
    projectId: '',
    role: '',
    description: '',
    acceptsBeginners: true,
    estimatedTime: 'médio' as 'pouco' | 'médio' | 'bastante'
  });
  const [isSubmittingOpening, setIsSubmittingOpening] = useState(false);

  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    projectId: '',
    area: 'arte' as TaskItem['area'],
    deliverySpecs: '',
    size: 'pequena' as 'pequena' | 'média' | 'grande',
    beginnerFriendly: true,
    deadline: '',
    helper: currentUserName || ''
  });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  const [projectSearch, setProjectSearch] = useState('');
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const [taskAreaFilter, setTaskAreaFilter] = useState('all');
  const [taskOnlyBeginners, setTaskOnlyBeginners] = useState(false);
  const [openingProjectFilter, setOpeningProjectFilter] = useState('all');

  const [proposalForm, setProposalForm] = useState({
    proposerName: currentUserName || '',
    proposerDiscord: '',
    proposerEmail: currentUserEmail || '',
    projectTitle: '',
    oneSentencePitch: '',
    genreAndReferences: '',
    differentiation: '',
    engine: 'Godot',
    projectScopeAndDeadline: 'Protótipo jogável neste semestre',
    teamAndNeeds: '',
    visualAttachmentsUrl: ''
  });
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);

  const [evaluationFeedback, setEvaluationFeedback] = useState('');
  const [evaluationDecision, setEvaluationDecision] = useState<ProposalItem['status']>('aprovado');
  const [isEvaluating, setIsEvaluating] = useState(false);

  const [checkInModalProject, setCheckInModalProject] = useState<ProjectItem | null>(null);
  const [checkInNotes, setCheckInNotes] = useState('');

  // Base de membros da LAJE e estado para o filtro do dashboard
  const [allResponses, setAllResponses] = useState<any[]>([]);
  const [isAddTeamMemberModalOpen, setIsAddTeamMemberModalOpen] = useState(false);
  const [teamMemberSearch, setTeamMemberSearch] = useState('');
  const [teamMemberRoleFilter, setTeamMemberRoleFilter] = useState('all');
  const [teamMemberProjectStatusFilter, setTeamMemberProjectStatusFilter] = useState('all');
  const [teamMemberStatusFilter, setTeamMemberStatusFilter] = useState<'all' | 'active' | 'former'>('all');
  const [memberAssignedRoles, setMemberAssignedRoles] = useState<{ [memberId: string]: string }>({});
  const [isSubmittingMemberAdd, setIsSubmittingMemberAdd] = useState<{ [memberId: string]: boolean }>({});
  const [emailModalData, setEmailModalData] = useState<EmailPayload | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projSnap, openSnap, taskSnap, propSnap, respSnap] = await Promise.all([
        getDocs(query(collection(db, 'projects'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'openings'), orderBy('openedAt', 'desc'))),
        getDocs(query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'proposals'), orderBy('createdAt', 'desc'))),
        getDocs(collection(db, 'responses'))
      ]);

      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectItem)));
      setOpenings(openSnap.docs.map(d => ({ id: d.id, ...d.data() } as OpeningItem)));
      setTasks(taskSnap.docs.map(d => ({ id: d.id, ...d.data() } as TaskItem)));
      setProposals(propSnap.docs.map(d => ({ id: d.id, ...d.data() } as ProposalItem)));
      setAllResponses(respSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error fetching projects hub data:', err);
      toast.error('Erro ao carregar dados de projetos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Creation & Deletion handlers
  const handleCreateProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!newProjectForm.name.trim() || !newProjectForm.leader.trim()) {
      toast.error('Informe ao menos o nome do projeto e o líder');
      return;
    }
    try {
      setIsSubmittingProject(true);
      const newProjData: Omit<ProjectItem, 'id'> = {
        name: newProjectForm.name.trim(),
        status: newProjectForm.status,
        engine: newProjectForm.engine || 'Godot',
        genre: newProjectForm.genre || 'Gênero indefinido',
        leader: newProjectForm.leader.trim(),
        leaderDiscord: newProjectForm.leaderDiscord.trim(),
        responsibleDirector: newProjectForm.responsibleDirector || 'Diretoria de Projetos',
        semester: newProjectForm.semester || '2026.2',
        description: newProjectForm.description || newProjectForm.elevatorPitch || 'Sem descrição cadastrada.',
        elevatorPitch: newProjectForm.elevatorPitch || newProjectForm.description,
        diferencial: newProjectForm.diferencial || '',
        pilares: newProjectForm.pilares || '',
        targetScope: newProjectForm.targetScope || 'Protótipo jogável neste semestre',
        teamMembers: newProjectForm.teamMembers || newProjectForm.leader,
        coverEmoji: newProjectForm.coverEmoji || '🎮',
        createdAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'projects'), newProjData);
      const createdItem: ProjectItem = { id: docRef.id, ...newProjData };
      setProjects([createdItem, ...projects]);
      setIsNewProjectModalOpen(false);
      setNewProjectForm({
        name: '',
        status: 'em produção',
        engine: 'Godot',
        genre: '',
        leader: currentUserName || '',
        leaderDiscord: '',
        responsibleDirector: 'Diretoria de Projetos',
        semester: '2026.2',
        description: '',
        elevatorPitch: '',
        diferencial: '',
        pilares: '',
        targetScope: 'Protótipo jogável neste semestre',
        teamMembers: '',
        coverEmoji: '🎮'
      });
      await logAuditAction({
        action: 'Criação de Registro',
        targetMemberName: newProjData.leader,
        details: `Novo projeto criado: "${newProjData.name}" (${newProjData.engine})`,
        newValue: JSON.stringify(newProjData)
      });
      toast.success(`Projeto "${newProjData.name}" cadastrado com sucesso!`);

      if (newProjectForm.notifyMembers) {
        try {
          const responseSnap = await getDocs(collection(db, 'responses'));
          const memberEmails = responseSnap.docs
            .map(doc => doc.data().email)
            .filter((email): email is string => Boolean(email && email.includes('@')));

          if (memberEmails.length > 0) {
            try {
              await addDoc(collection(db, 'announcements'), {
                title: `Novo Projeto: ${newProjData.name} ${newProjData.coverEmoji || '🎮'}`,
                projectName: newProjData.name,
                genre: newProjData.genre,
                engine: newProjData.engine,
                leader: newProjData.leader,
                description: newProjData.elevatorPitch || newProjData.description,
                createdAt: new Date().toISOString(),
                author: currentUserEmail,
                coverEmoji: newProjData.coverEmoji || '🎮'
              });
            } catch (annError) {
              console.warn('Erro ao salvar anúncio no Firestore:', annError);
            }

            const payload = buildProjectEmail(newProjData, memberEmails);
            openManualEmailInBrowser(payload);
            setEmailModalData(payload);
            toast.success(`Aba aberta no navegador para disparo do e-mail do projeto aos membros!`);
          }
        } catch (emailErr) {
          console.error('Erro ao processar notificações:', emailErr);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao cadastrar projeto');
    } finally {
      setIsSubmittingProject(false);
    }
  };

  const handleOpenEditProject = (p: ProjectItem, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingProject(p);
    setEditProjectForm({
      name: p.name || '',
      status: p.status || 'em produção',
      engine: p.engine || 'Godot',
      genre: p.genre || '',
      leader: p.leader || '',
      leaderDiscord: p.leaderDiscord || '',
      responsibleDirector: p.responsibleDirector || 'Diretoria de Projetos',
      semester: p.semester || '2026.2',
      description: p.description || '',
      elevatorPitch: p.elevatorPitch || p.description || '',
      diferencial: p.diferencial || '',
      pilares: p.pilares || '',
      targetScope: p.targetScope || 'Protótipo jogável neste semestre',
      teamMembers: p.teamMembers || '',
      coverEmoji: p.coverEmoji || '🎮'
    });
    setIsEditProjectModalOpen(true);
  };

  const handleSaveEditProject = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProject?.id) return;
    if (!editProjectForm.name.trim() || !editProjectForm.leader.trim()) {
      toast.error('Informe ao menos o nome do jogo e o líder');
      return;
    }
    try {
      setIsSavingProjectEdit(true);
      const updateData: Partial<ProjectItem> = {
        name: editProjectForm.name.trim(),
        status: editProjectForm.status,
        engine: editProjectForm.engine || 'Godot',
        genre: editProjectForm.genre.trim() || 'Gênero indefinido',
        leader: editProjectForm.leader.trim(),
        leaderDiscord: editProjectForm.leaderDiscord.trim(),
        responsibleDirector: editProjectForm.responsibleDirector.trim() || 'Diretoria de Projetos',
        semester: editProjectForm.semester.trim() || '2026.2',
        description: editProjectForm.description.trim() || editProjectForm.elevatorPitch.trim() || 'Sem descrição cadastrada.',
        elevatorPitch: editProjectForm.elevatorPitch.trim() || editProjectForm.description.trim(),
        diferencial: editProjectForm.diferencial.trim(),
        pilares: editProjectForm.pilares.trim(),
        targetScope: editProjectForm.targetScope.trim() || 'Protótipo jogável neste semestre',
        teamMembers: editProjectForm.teamMembers.trim() || editProjectForm.leader.trim(),
        coverEmoji: editProjectForm.coverEmoji || '🎮'
      };

      await updateDoc(doc(db, 'projects', editingProject.id), updateData);

      const mergedProject: ProjectItem = {
        ...editingProject,
        ...updateData
      };

      setProjects(prev => prev.map(p => p.id === editingProject.id ? mergedProject : p));
      if (selectedProject?.id === editingProject.id) {
        setSelectedProject(mergedProject);
      }

      await logAuditAction({
        action: 'Edição de Jogo',
        targetMemberName: editProjectForm.name.trim(),
        details: `Ficha do jogo "${editProjectForm.name.trim()}" atualizada por ${currentUserName || activeEmail}`,
        previousValue: JSON.stringify(editingProject),
        newValue: JSON.stringify(mergedProject),
        performedByEmail: activeEmail,
        performedByName: currentUserName || 'Membro do RH'
      });

      toast.success(`Jogo "${editProjectForm.name}" atualizado com sucesso!`);
      setIsEditProjectModalOpen(false);
      setEditingProject(null);
    } catch (err) {
      console.error('Erro ao atualizar dados do jogo:', err);
      toast.error('Erro ao salvar alterações do jogo');
    } finally {
      setIsSavingProjectEdit(false);
    }
  };

  const handleBroadcastProjectEmail = async (project: ProjectItem) => {
    try {
      const responseSnap = await getDocs(collection(db, 'responses'));
      const memberEmails = responseSnap.docs
        .map(doc => doc.data().email)
        .filter((email): email is string => Boolean(email && email.includes('@')));

      if (memberEmails.length === 0) {
        toast.error('Nenhum e-mail de membro cadastrado encontrado no banco de dados.');
        return;
      }

      const payload = buildProjectEmail(project, memberEmails);
      openManualEmailInBrowser(payload);
      setEmailModalData(payload);
      toast.success(`Aba do navegador aberta com o e-mail de "${project.name}" preparado!`);
    } catch (err) {
      console.error('Erro ao disparar comunicado por e-mail:', err);
      toast.error('Erro ao gerar comunicado por e-mail');
    }
  };

  const handleBroadcastOpeningEmail = async (opening: OpeningItem | { role: string; projectName: string; description: string; estimatedTime?: string; acceptsBeginners?: boolean }) => {
    try {
      const responseSnap = await getDocs(collection(db, 'responses'));
      const memberEmails = responseSnap.docs
        .map(doc => doc.data().email)
        .filter((email): email is string => Boolean(email && email.includes('@')));

      if (memberEmails.length === 0) {
        toast.error('Nenhum e-mail de membro cadastrado encontrado.');
        return;
      }

      const payload = buildOpeningEmail(opening, memberEmails);
      openManualEmailInBrowser(payload);
      setEmailModalData(payload);
      toast.success(`Aba do navegador aberta com o e-mail da vaga "${opening.role}"!`);
    } catch (err) {
      console.error('Erro ao disparar e-mail de vaga:', err);
      toast.error('Erro ao gerar e-mail da vaga');
    }
  };

  const handleBroadcastTaskEmail = async (task: TaskItem | { title: string; projectName: string; area: string; deliverySpecs: string; size?: string; deadline?: string; helper?: string }) => {
    try {
      const responseSnap = await getDocs(collection(db, 'responses'));
      const memberEmails = responseSnap.docs
        .map(doc => doc.data().email)
        .filter((email): email is string => Boolean(email && email.includes('@')));

      if (memberEmails.length === 0) {
        toast.error('Nenhum e-mail de membro cadastrado encontrado.');
        return;
      }

      const payload = buildTaskEmail(task, memberEmails);
      openManualEmailInBrowser(payload);
      setEmailModalData(payload);
      toast.success(`Aba do navegador aberta com o e-mail da tarefa "${task.title}"!`);
    } catch (err) {
      console.error('Erro ao disparar e-mail de tarefa:', err);
      toast.error('Erro ao gerar e-mail da tarefa');
    }
  };

  const handleCreateOpening = async (e: FormEvent) => {
    e.preventDefault();
    if (!newOpeningForm.role.trim() || !newOpeningForm.description.trim()) {
      toast.error('Preencha a função e a descrição da vaga');
      return;
    }
    const chosenProj = projects.find(p => p.id === newOpeningForm.projectId) || projects[0];
    const projectName = chosenProj ? chosenProj.name : 'Projeto Geral da Liga';
    const projectId = chosenProj && chosenProj.id ? chosenProj.id : 'geral';

    try {
      setIsSubmittingOpening(true);
      const newOpeningData: Omit<OpeningItem, 'id'> = {
        role: newOpeningForm.role.trim(),
        projectId,
        projectName,
        description: newOpeningForm.description.trim(),
        acceptsBeginners: newOpeningForm.acceptsBeginners,
        estimatedTime: newOpeningForm.estimatedTime,
        status: 'aberta',
        openedAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'openings'), newOpeningData);
      setOpenings([{ id: docRef.id, ...newOpeningData }, ...openings]);
      setIsNewOpeningModalOpen(false);
      setNewOpeningForm({
        projectId: projects[0]?.id || '',
        role: '',
        description: '',
        acceptsBeginners: true,
        estimatedTime: 'médio'
      });
      await logAuditAction({
        action: 'Criação de Registro',
        targetMemberName: projectName,
        details: `Nova vaga aberta: "${newOpeningData.role}" para "${projectName}"`,
        newValue: JSON.stringify(newOpeningData)
      });
      toast.success('Vaga publicada com sucesso!');
      handleBroadcastOpeningEmail(newOpeningData);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao publicar vaga');
    } finally {
      setIsSubmittingOpening(false);
    }
  };

  const handleCreateTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTaskForm.title.trim() || !newTaskForm.deliverySpecs.trim()) {
      toast.error('Preencha o título e as especificações de entrega da tarefa');
      return;
    }
    const chosenProj = projects.find(p => p.id === newTaskForm.projectId) || projects[0];
    const projectName = chosenProj ? chosenProj.name : 'Geral da Liga';
    const projectId = chosenProj && chosenProj.id ? chosenProj.id : 'geral';

    try {
      setIsSubmittingTask(true);
      const newTaskData: Omit<TaskItem, 'id'> = {
        title: newTaskForm.title.trim(),
        projectId,
        projectName,
        area: newTaskForm.area,
        deliverySpecs: newTaskForm.deliverySpecs.trim(),
        size: newTaskForm.size,
        beginnerFriendly: newTaskForm.beginnerFriendly,
        deadline: newTaskForm.deadline || '',
        helper: newTaskForm.helper || currentUserName || '',
        status: 'aberta',
        createdAt: Date.now()
      };
      const docRef = await addDoc(collection(db, 'tasks'), newTaskData);
      setTasks([{ id: docRef.id, ...newTaskData }, ...tasks]);
      setIsNewTaskModalOpen(false);
      setNewTaskForm({
        title: '',
        projectId: projects[0]?.id || '',
        area: 'arte',
        deliverySpecs: '',
        size: 'pequena',
        beginnerFriendly: true,
        deadline: '',
        helper: currentUserName || ''
      });
      toast.success('Tarefa adicionada ao mural com sucesso!');
      handleBroadcastTaskEmail(newTaskData);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao adicionar tarefa');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  const handleDeleteProject = async (project: ProjectItem) => {
    if (!project.id) return;
    if (!confirm(`Tem certeza que deseja excluir o projeto "${project.name}"? As vagas e tarefas vinculadas também serão removidas.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'projects', project.id));
      const relatedOpenings = openings.filter(o => o.projectId === project.id);
      for (const op of relatedOpenings) {
        if (op.id) await deleteDoc(doc(db, 'openings', op.id));
      }
      const relatedTasks = tasks.filter(t => t.projectId === project.id);
      for (const t of relatedTasks) {
        if (t.id) await deleteDoc(doc(db, 'tasks', t.id));
      }
      setProjects(projects.filter(p => p.id !== project.id));
      setOpenings(openings.filter(o => o.projectId !== project.id));
      setTasks(tasks.filter(t => t.projectId !== project.id));
      setSelectedProject(null);
      await logAuditAction({
        action: 'Exclusão de Membro/Registro',
        targetMemberName: project.name,
        details: `Projeto excluído: "${project.name}"`,
      });
      toast.success(`Projeto "${project.name}" excluído.`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir projeto');
    }
  };

  const handleDeleteOpening = async (opening: OpeningItem) => {
    if (!opening.id) return;
    if (!confirm(`Deseja excluir a vaga "${opening.role}"?`)) return;
    try {
      await deleteDoc(doc(db, 'openings', opening.id));
      setOpenings(openings.filter(o => o.id !== opening.id));
      toast.success('Vaga excluída com sucesso.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir vaga');
    }
  };

  const handleDeleteTask = async (task: TaskItem) => {
    if (!task.id) return;
    if (!confirm(`Deseja excluir a tarefa "${task.title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'tasks', task.id));
      setTasks(tasks.filter(t => t.id !== task.id));
      toast.success('Tarefa excluída do mural.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir tarefa');
    }
  };

  const handleClearAllData = async () => {
    if (!confirm('ATENÇÃO: Deseja apagar TODOS os projetos, vagas e tarefas do banco para começar do zero? Esta ação é irreversível.')) {
      return;
    }
    try {
      setLoading(true);
      await clearAllProjectsAndOpenings();
      setProjects([]);
      setOpenings([]);
      setTasks([]);
      localStorage.setItem('laje_cleared_initial_projects_v5', 'true');
      toast.success('Todos os projetos, vagas e tarefas foram removidos com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao limpar dados');
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (projectStatusFilter !== 'all') {
        const s = (p.status || '').toLowerCase().trim();
        if (projectStatusFilter === 'em andamento') {
          if (!['em andamento', 'andamento', 'em produção', 'em producao', 'desenvolvimento'].includes(s)) return false;
        } else if (projectStatusFilter === 'concluído') {
          if (!['concluído', 'concluido', 'finalizado'].includes(s)) return false;
        } else if (projectStatusFilter === 'pausado') {
          if (!['pausado', 'em espera'].includes(s)) return false;
        } else if (projectStatusFilter === 'aprovado') {
          if (!['aprovado', 'aprovado com escopo menor'].includes(s)) return false;
        } else if (projectStatusFilter === 'em análise') {
          if (!['em análise', 'em analise', 'análise'].includes(s)) return false;
        } else if (projectStatusFilter === 'ideia') {
          if (!['ideia', 'conceito'].includes(s)) return false;
        } else if (s !== projectStatusFilter) {
          return false;
        }
      }

      if (!projectSearch.trim()) return true;

      const q = projectSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.genre.toLowerCase().includes(q) ||
        p.engine.toLowerCase().includes(q) ||
        p.leader.toLowerCase().includes(q) ||
        (p.status && p.status.toLowerCase().includes(q))
      );
    });
  }, [projects, projectSearch, projectStatusFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (taskAreaFilter !== 'all' && t.area.toLowerCase() !== taskAreaFilter.toLowerCase()) return false;
      if (taskOnlyBeginners && !t.beginnerFriendly) return false;
      return true;
    });
  }, [tasks, taskAreaFilter, taskOnlyBeginners]);

  const filteredOpenings = useMemo(() => {
    return openings.filter(o => {
      if (o.status !== 'aberta') return false;
      if (openingProjectFilter !== 'all' && o.projectId !== openingProjectFilter) return false;
      return true;
    });
  }, [openings, openingProjectFilter]);

  // Lista dinâmica de funções distintas na base de membros da LAJE (para o filtro do Dashboard)
  const distinctMemberRoles = useMemo(() => {
    return Array.from(
      new Set<string>(
        allResponses.flatMap(m =>
          m.leagueRole
            ? String(m.leagueRole).split(',').map((r: string) => r.trim()).filter(Boolean)
            : []
        )
      )
    ).sort();
  }, [allResponses]);

  // Filtro idêntico ao do Dashboard para buscar membros da equipe
  const filteredAddMembers = useMemo(() => {
    return allResponses.filter(member => {
      // 1. Busca textual: nome, e-mail, discord, curso, projetos atuais
      if (teamMemberSearch.trim()) {
        const q = teamMemberSearch.toLowerCase().trim();
        const matchName = member.name?.toLowerCase().includes(q);
        const matchEmail = member.email?.toLowerCase().includes(q);
        const matchDiscord = member.discordUser?.toLowerCase().includes(q);
        const matchCourse = member.course?.toLowerCase().includes(q);
        const matchProject = member.currentProjects?.toLowerCase().includes(q);
        if (!matchName && !matchEmail && !matchDiscord && !matchCourse && !matchProject) {
          return false;
        }
      }

      // 2. Filtro por Função na Liga (leagueRole)
      if (teamMemberRoleFilter !== 'all') {
        if (!member.leagueRole) return false;
        const roles = String(member.leagueRole).toLowerCase().split(',').map((r: string) => r.trim());
        const targetRole = teamMemberRoleFilter.toLowerCase().trim();
        const matches = roles.some((r: string) => r.includes(targetRole) || targetRole.includes(r));
        if (!matches) return false;
      }

      // 3. Filtro por Status de Projeto
      if (teamMemberProjectStatusFilter !== 'all') {
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

        if (teamMemberProjectStatusFilter === 'in_project') {
          if (!hasProject) return false;
        } else if (teamMemberProjectStatusFilter === 'waiting_invite') {
          if (!isWaiting) return false;
        } else if (teamMemberProjectStatusFilter === 'observing') {
          if (!isObserving) return false;
        } else if (teamMemberProjectStatusFilter === 'no_project') {
          if (hasProject) return false;
        }
      }

      // 4. Filtro por Situação Cadastral (Ativos vs Ex-membros)
      if (teamMemberStatusFilter !== 'all') {
        if (teamMemberStatusFilter === 'active' && member.status === 'Ex-membro') return false;
        if (teamMemberStatusFilter === 'former' && member.status !== 'Ex-membro') return false;
      }

      return true;
    });
  }, [allResponses, teamMemberSearch, teamMemberRoleFilter, teamMemberProjectStatusFilter, teamMemberStatusFilter]);

  // Verifica se o membro já consta na string teamMembers
  const isMemberInProject = (memberName: string, teamMembersStr?: string) => {
    if (!memberName || !teamMembersStr) return false;
    const target = memberName.toLowerCase().trim();
    const members = teamMembersStr.split(/,|\n/).map(s => s.trim().toLowerCase());
    return members.some(m => {
      const clean = m.replace(/\([^)]*\)/g, '').trim();
      return clean === target || clean.includes(target) || target.includes(clean);
    });
  };

  // Helper para estruturar os membros da equipe com papéis e vínculos aos dados cadastrais
  const parseTeamMembersList = (teamMembersStr?: string) => {
    if (!teamMembersStr) return [];
    return teamMembersStr
      .split(/,|\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(entry => {
        const match = entry.match(/^([^(]+)(?:\(([^)]+)\))?$/);
        const name = match ? match[1].trim() : entry;
        const role = match && match[2] ? match[2].trim() : 'Membro';
        const isLeader = role.toLowerCase().includes('líder') || role.toLowerCase().includes('lider');

        // Busca o membro na base completa de respostas para trazer Discord, e-mail e foto
        const responseMatch = allResponses.find(r =>
          (r.name || '').toLowerCase().trim() === name.toLowerCase().trim()
        );

        return {
          raw: entry,
          name,
          role,
          isLeader,
          responseMatch
        };
      });
  };

  // Adiciona membro da equipe usando o filtro do Dashboard
  const handleAddMemberToCurrentProject = async (member: any, roleOverride?: string) => {
    if (!selectedProject?.id) return;
    const memberName = (member.name || '').trim();
    if (!memberName) return;

    let assignedRole = (roleOverride || memberAssignedRoles[member.id] || '').trim();
    if (!assignedRole) {
      if (member.leagueRole) {
        const firstRole = String(member.leagueRole).split(',')[0].trim();
        assignedRole = firstRole;
      } else {
        assignedRole = 'Equipe';
      }
    }

    const currentTeamStr = (selectedProject.teamMembers || '').trim();
    if (isMemberInProject(memberName, currentTeamStr)) {
      toast.error(`${memberName} já está na equipe deste projeto!`);
      return;
    }

    const memberEntry = `${memberName} (${assignedRole})`;

    try {
      setIsSubmittingMemberAdd(prev => ({ ...prev, [member.id]: true }));

      const updatedTeamStr = currentTeamStr ? `${currentTeamStr}, ${memberEntry}` : memberEntry;

      // 1. Atualiza projeto no Firestore
      await updateDoc(doc(db, 'projects', selectedProject.id), {
        teamMembers: updatedTeamStr
      });

      // 2. Atualiza ficha cadastral do membro para constar o projeto
      const currentProjStr = (member.currentProjects || '').trim();
      const updatedProjStr = currentProjStr && currentProjStr.toLowerCase() !== 'nenhum'
        ? (currentProjStr.toLowerCase().includes(selectedProject.name.toLowerCase()) 
            ? currentProjStr 
            : `${currentProjStr}, ${selectedProject.name}`)
        : selectedProject.name;

      if (member.id) {
        try {
          await updateDoc(doc(db, 'responses', member.id), {
            currentProjects: updatedProjStr,
            isInProject: 'Sim'
          });
        } catch (respErr) {
          console.warn('Erro ao atualizar respostas do membro (não bloqueante):', respErr);
        }
      }

      // 3. Auditoria
      await logAuditAction({
        action: 'Alocação em Projeto',
        targetMemberId: member.id || '',
        targetMemberName: memberName,
        targetMemberEmail: member.email || '',
        details: `Membro "${memberName}" adicionado à equipe do projeto "${selectedProject.name}" como "${assignedRole}" por ${currentUserName || activeEmail} (via Filtro do Dashboard)`,
        newValue: JSON.stringify({ project: selectedProject.name, role: assignedRole, teamMembers: updatedTeamStr }),
        performedByEmail: activeEmail,
        performedByName: currentUserName || (isSuperAdminEmail ? 'Super Admin' : 'Membro do RH')
      });

      // 4. Atualização de estado local imediata
      const updatedProject: ProjectItem = { ...selectedProject, teamMembers: updatedTeamStr };
      setSelectedProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));
      setAllResponses(prev => prev.map(m => m.id === member.id ? { ...m, currentProjects: updatedProjStr, isInProject: 'Sim' } : m));

      toast.success(`"${memberName}" adicionado(a) à equipe como "${assignedRole}"!`);
    } catch (err) {
      console.error('Erro ao adicionar membro à equipe:', err);
      toast.error('Erro ao adicionar membro à equipe.');
    } finally {
      setIsSubmittingMemberAdd(prev => ({ ...prev, [member.id]: false }));
    }
  };

  // Remove membro da equipe com confirmação
  const handleRemoveMemberFromCurrentProject = async (rawMemberStr: string) => {
    if (!selectedProject?.id) return;
    const cleanName = rawMemberStr.replace(/\([^)]*\)/g, '').trim();
    if (!confirm(`Tem certeza que deseja remover "${cleanName}" da equipe do projeto "${selectedProject.name}"?`)) {
      return;
    }

    try {
      const currentTeamStr = (selectedProject.teamMembers || '').trim();
      const membersList = currentTeamStr.split(/,|\n/).map(s => s.trim()).filter(Boolean);
      const updatedMembersList = membersList.filter(s => {
        const name = s.replace(/\([^)]*\)/g, '').trim().toLowerCase();
        return name !== cleanName.toLowerCase();
      });
      const updatedTeamStr = updatedMembersList.join(', ');

      await updateDoc(doc(db, 'projects', selectedProject.id), {
        teamMembers: updatedTeamStr
      });

      // Atualiza o documento em responses se o membro for localizado
      const matchedMember = allResponses.find(m => (m.name || '').toLowerCase().trim() === cleanName.toLowerCase());
      if (matchedMember?.id) {
        try {
          const curProj = (matchedMember.currentProjects || '')
            .split(',')
            .map((p: string) => p.trim())
            .filter((p: string) => p && p.toLowerCase() !== selectedProject.name.toLowerCase())
            .join(', ');
          await updateDoc(doc(db, 'responses', matchedMember.id), {
            currentProjects: curProj,
            isInProject: curProj ? 'Sim' : 'Não'
          });
          setAllResponses(prev => prev.map(m => m.id === matchedMember.id ? { ...m, currentProjects: curProj, isInProject: curProj ? 'Sim' : 'Não' } : m));
        } catch (respErr) {
          console.warn('Erro ao atualizar respostas do membro removido:', respErr);
        }
      }

      await logAuditAction({
        action: 'Desalocação de Projeto',
        targetMemberName: cleanName,
        targetMemberEmail: matchedMember?.email || '',
        details: `Membro "${cleanName}" removido da equipe do projeto "${selectedProject.name}" por ${currentUserName || activeEmail}`,
        previousValue: currentTeamStr,
        newValue: updatedTeamStr,
        performedByEmail: activeEmail,
        performedByName: currentUserName || (isSuperAdminEmail ? 'Super Admin' : 'Membro do RH')
      });

      const updatedProject: ProjectItem = { ...selectedProject, teamMembers: updatedTeamStr };
      setSelectedProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === selectedProject.id ? updatedProject : p));

      toast.success(`"${cleanName}" removido(a) da equipe.`);
    } catch (err) {
      console.error('Erro ao remover membro da equipe:', err);
      toast.error('Erro ao remover membro da equipe');
    }
  };

  const handleClaimTask = async (task: TaskItem) => {
    if (!task.id) return;
    const authorEmail = currentUserEmail || auth.currentUser?.email || 'membro@laje.cin';
    const authorName = currentUserName || auth.currentUser?.displayName || authorEmail.split('@')[0];

    try {
      const updateData = {
        status: 'pegaram' as const,
        claimedBy: authorName,
        claimedByEmail: authorEmail,
        claimedAt: Date.now()
      };
      await updateDoc(doc(db, 'tasks', task.id), updateData);
      
      setTasks(tasks.map(t => t.id === task.id ? { ...t, ...updateData } : t));
      if (selectedTask?.id === task.id) {
        setSelectedTask({ ...selectedTask, ...updateData });
      }

      await logAuditAction({
        action: 'Atualização de Dados',
        targetMemberName: authorName,
        targetMemberEmail: authorEmail,
        details: `Membro pegou a tarefa avulsa "${task.title}" do projeto "${task.projectName}"`,
      });

      toast.success('Tarefa assumida! Entre em contato com quem tira dúvidas para alinhar detalhes.');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao pegar tarefa');
    }
  };

  const handleDeliverTask = async (task: TaskItem) => {
    if (!task.id) return;
    try {
      const updateData = {
        status: 'entregue' as const,
        deliveredAt: Date.now()
      };
      await updateDoc(doc(db, 'tasks', task.id), updateData);
      setTasks(tasks.map(t => t.id === task.id ? { ...t, ...updateData } : t));
      if (selectedTask?.id === task.id) {
        setSelectedTask({ ...selectedTask, ...updateData });
      }
      toast.success('Parabéns pela entrega! Seu nome será incluído nos créditos do jogo 🎉');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao registrar entrega');
    }
  };

  const handleSubmitProposal = async (e: FormEvent) => {
    e.preventDefault();
    if (!proposalForm.projectTitle.trim() || !proposalForm.oneSentencePitch.trim()) {
      toast.error('Preencha ao menos o título e a descrição em uma frase');
      return;
    }

    try {
      setIsSubmittingProposal(true);
      const newProposal: Omit<ProposalItem, 'id'> = {
        proposerName: proposalForm.proposerName || currentUserName || 'Membro da LAJE',
        proposerDiscord: proposalForm.proposerDiscord,
        proposerEmail: proposalForm.proposerEmail || currentUserEmail || '',
        proposerUid: auth.currentUser?.uid || '',
        projectTitle: proposalForm.projectTitle,
        oneSentencePitch: proposalForm.oneSentencePitch,
        genreAndReferences: proposalForm.genreAndReferences,
        differentiation: proposalForm.differentiation,
        engine: proposalForm.engine,
        projectScopeAndDeadline: proposalForm.projectScopeAndDeadline,
        teamAndNeeds: proposalForm.teamAndNeeds,
        visualAttachmentsUrl: proposalForm.visualAttachmentsUrl,
        status: 'recebido',
        createdAt: Date.now()
      };

      const docRef = await addDoc(collection(db, 'proposals'), newProposal);
      setProposals([{ id: docRef.id, ...newProposal }, ...proposals]);

      toast.success('Proposta enviada com sucesso! A diretoria responderá em até 15 dias.');
      setProposalForm({
        proposerName: currentUserName || '',
        proposerDiscord: '',
        proposerEmail: currentUserEmail || '',
        projectTitle: '',
        oneSentencePitch: '',
        genreAndReferences: '',
        differentiation: '',
        engine: 'Godot',
        projectScopeAndDeadline: 'Protótipo jogável neste semestre',
        teamAndNeeds: '',
        visualAttachmentsUrl: ''
      });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar proposta');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleEvaluateProposal = async () => {
    if (!selectedProposal?.id) return;
    try {
      setIsEvaluating(true);
      const updateData = {
        status: evaluationDecision,
        boardFeedback: evaluationFeedback,
        respondedAt: Date.now()
      };
      await updateDoc(doc(db, 'proposals', selectedProposal.id), updateData);
      
      setProposals(proposals.map(p => p.id === selectedProposal.id ? { ...p, ...updateData } : p));
      setSelectedProposal(null);
      setEvaluationFeedback('');
      toast.success(`Decisão registrada como: ${evaluationDecision}`);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar avaliação');
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleSaveCheckIn = async () => {
    if (!checkInModalProject?.id) return;
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const updateData = {
        lastCheckInDate: todayStr,
        lastCheckInNotes: checkInNotes
      };
      await updateDoc(doc(db, 'projects', checkInModalProject.id), updateData);
      setProjects(projects.map(p => p.id === checkInModalProject.id ? { ...p, ...updateData } : p));
      if (selectedProject?.id === checkInModalProject.id) {
        setSelectedProject({ ...selectedProject, ...updateData });
      }
      setCheckInModalProject(null);
      setCheckInNotes('');
      toast.success('Check-in quinzenal registrado com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao registrar check-in');
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase().trim();
    switch (s) {
      case 'em andamento':
      case 'andamento':
      case 'desenvolvimento':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            Em Andamento
          </span>
        );
      case 'em produção':
      case 'em producao':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            Em Produção
          </span>
        );
      case 'concluído':
      case 'concluido':
      case 'finalizado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <CheckCircle2 size={12} className="text-cyan-400 shrink-0" />
            Concluído
          </span>
        );
      case 'pausado':
      case 'em espera':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
            <Clock size={12} className="text-amber-400 shrink-0" />
            Pausado
          </span>
        );
      case 'aprovado':
      case 'aprovado com escopo menor':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-teal-500/15 text-teal-300 border border-teal-500/30 shadow-[0_0_12px_rgba(20,184,166,0.15)]">
            <Check size={12} className="text-teal-400 shrink-0" />
            Aprovado
          </span>
        );
      case 'em análise':
      case 'em analise':
      case 'análise':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-violet-500/15 text-violet-300 border border-violet-500/30 shadow-[0_0_12px_rgba(139,92,246,0.15)]">
            <Sparkles size={12} className="text-violet-400 shrink-0" />
            Em Análise
          </span>
        );
      case 'ideia':
      case 'conceito':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30 shadow-[0_0_12px_rgba(217,70,239,0.15)]">
            <Lightbulb size={12} className="text-fuchsia-400 shrink-0" />
            Ideia
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-rose-500/15 text-rose-300 border border-rose-500/30 shadow-[0_0_12px_rgba(244,63,94,0.15)]">
            <AlertTriangle size={12} className="text-rose-400 shrink-0" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold font-['Space_Mono'] bg-gray-800 text-gray-300 border border-gray-700 capitalize">
            {status}
          </span>
        );
    }
  };

  return (
    <div id="projects-hub" className="w-full max-w-5xl mx-auto space-y-8 pb-16 animate-in fade-in duration-300 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--color-ink-faint)] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Gamepad2 size={26} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-['Syne'] font-bold text-white tracking-tight">
                  Projetos & Oportunidades
                </h2>
              </div>
              <p className="text-xs text-gray-400 font-['Space_Mono'] mt-1">
                Catálogo de jogos, vagas abertas, mural de tarefas e submissão de propostas
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black/40 border border-[var(--color-ink-faint)]">
          <button
            onClick={() => setActiveSubTab('projetos')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-['Space_Mono'] font-bold transition-all cursor-pointer ${
              activeSubTab === 'projetos'
                ? 'bg-[var(--color-ink-faint)] text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Gamepad2 size={14} />
            Jogos ({projects.length})
          </button>
          <button
            onClick={() => setActiveSubTab('vagas')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-['Space_Mono'] font-bold transition-all cursor-pointer ${
              activeSubTab === 'vagas'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Briefcase size={14} className={openings.length > 0 ? 'text-amber-400' : ''} />
            Vagas ({openings.filter(o => o.status === 'aberta').length})
          </button>
          <button
            onClick={() => setActiveSubTab('mural')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-['Space_Mono'] font-bold transition-all cursor-pointer ${
              activeSubTab === 'mural'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Kanban size={14} className="text-emerald-400" />
            Mural de Tarefas ({tasks.filter(t => t.status === 'aberta').length})
          </button>
          <button
            onClick={() => setActiveSubTab('proposta')}
            className={`flex items-center gap-2 px-3.5 py-2 text-xs font-['Space_Mono'] font-bold transition-all cursor-pointer ${
              activeSubTab === 'proposta'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles size={14} className="text-purple-400" />
            Propor Jogo
          </button>
        </div>
      </div>

      {activeSubTab === 'projetos' && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                <input
                  type="text"
                  placeholder="BUSCAR POR JOGO, ENGINE, GÊNERO OU LÍDER..."
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                  className="w-full bg-transparent border border-[var(--color-ink-faint)] py-2 pl-10 pr-3 text-xs text-white font-['Space_Mono'] uppercase outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-500 shrink-0 hidden sm:inline" />
                <select
                  value={projectStatusFilter}
                  onChange={e => setProjectStatusFilter(e.target.value)}
                  className="w-full sm:w-auto bg-[#161619] border border-[var(--color-ink-faint)] py-2 px-3 text-xs text-gray-300 font-['Space_Mono'] outline-none cursor-pointer focus:border-[var(--color-accent)]"
                >
                  <option value="all">Todos os Status</option>
                  <option value="em andamento">Em Andamento</option>
                  <option value="concluído">Concluído</option>
                  <option value="pausado">Pausado</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="em análise">Em Análise</option>
                  <option value="ideia">Ideia</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3">
              <span className="text-xs font-['Space_Mono'] text-gray-400">
                {filteredProjects.length} {filteredProjects.length === 1 ? 'projeto' : 'projetos'}
              </span>
              {canEditGames && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsNewProjectModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                  >
                    <Plus size={14} /> Novo Projeto
                  </button>
                  {isAdmin && (
                    <button
                      onClick={handleClearAllData}
                      title="Limpar todos os projetos e vagas para cadastrar novos"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} /> Limpar Tudo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.length === 0 ? (
              <div className="col-span-full py-16 px-6 text-center border border-dashed border-[var(--color-ink-faint)] bg-black/20 text-gray-400 space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Gamepad2 size={28} />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white font-['Syne']">Nenhum projeto cadastrado</h4>
                  <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto font-['Space_Mono']">
                    A base de projetos está limpa para você cadastrar seus projetos oficiais da LAJE.
                  </p>
                </div>
                {canEditGames && (
                  <button
                    onClick={() => setIsNewProjectModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer shadow-lg"
                  >
                    <Plus size={16} /> Cadastrar Primeiro Projeto
                  </button>
                )}
              </div>
            ) : (
              filteredProjects.map(proj => {
              const projectOpenings = openings.filter(o => o.projectId === proj.id && o.status === 'aberta');
              const projectTasks = tasks.filter(t => t.projectId === proj.id && t.status === 'aberta');

              return (
                <div
                  key={proj.id || proj.name}
                  onClick={() => setSelectedProject(proj)}
                  className="p-5 bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] border border-[var(--color-ink-faint)] hover:border-gray-600 transition-all flex flex-col justify-between group cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="w-12 h-12 rounded-lg bg-gray-800/80 border border-gray-700 flex items-center justify-center text-2xl shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                        {proj.coverEmoji || '🎮'}
                      </div>
                      <div className="text-right flex flex-col items-end shrink-0">
                        {getStatusBadge(proj.status)}
                        <span className="block text-[10px] text-gray-500 font-['Space_Mono'] mt-1">
                          {proj.semester || '2026.2'}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-white font-['Syne'] group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {proj.name}
                    </h3>
                    <p className="text-xs text-amber-400/90 font-['Space_Mono'] font-medium mb-2">
                      {proj.genre} • {proj.engine}
                    </p>
                    <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed mb-4">
                      {proj.description}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-4 pt-3 border-t border-gray-800 text-[11px] font-['Space_Mono']">
                      {projectOpenings.length > 0 && (
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {projectOpenings.length} {projectOpenings.length === 1 ? 'vaga' : 'vagas'}
                        </span>
                      )}
                      {projectTasks.length > 0 && (
                        <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          {projectTasks.length} {projectTasks.length === 1 ? 'tarefa no mural' : 'tarefas no mural'}
                        </span>
                      )}
                      {projectOpenings.length === 0 && projectTasks.length === 0 && (
                        <span className="text-gray-500">Equipe completa no momento</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span className="truncate max-w-[130px]">Líder: <strong className="text-gray-200">{proj.leader}</strong></span>
                      <div className="flex items-center gap-2">
                        {canEditGames && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleBroadcastProjectEmail(proj);
                              }}
                              className="px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-['Space_Mono'] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Abrir aba no navegador para notificar membros deste projeto por e-mail"
                            >
                              <Mail size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenEditProject(proj, e)}
                              className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-[11px] font-['Space_Mono'] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Editar informações do jogo"
                            >
                              <Edit2 size={12} /> Editar
                            </button>
                          </>
                        )}
                        <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-1 font-['Space_Mono'] font-bold text-[11px]">
                          Ver Ficha <ChevronRight size={13} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: VAGAS ABERTAS (INVERTER O SENTIDO DO CONVITE) */}
      {activeSubTab === 'vagas' && (
        <div className="space-y-6">
          {/* Banner: Inverter o Sentido do Convite */}
          <div className="p-5 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 relative">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0">
                  <Lightbulb size={22} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white font-['Syne']">
                    Invertendo o Sentido do Convite
                  </h4>
                  <p className="text-xs text-gray-300 mt-1 max-w-xl leading-relaxed">
                    Vagas abertas com demandas claras. Os líderes usam seu formulário para convidar você diretamente.
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => setIsNewOpeningModalOpen(true)}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors shrink-0 cursor-pointer"
                >
                  + Publicar Vaga
                </button>
              )}
            </div>
          </div>

          {/* Openings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOpenings.length === 0 ? (
              <div className="col-span-full py-16 px-6 text-center border border-dashed border-[var(--color-ink-faint)] bg-black/20 text-gray-400 space-y-4">
                <Briefcase size={32} className="mx-auto text-gray-600 mb-2" />
                <div>
                  <p className="text-base font-semibold text-gray-200 font-['Syne']">Nenhuma vaga aberta no momento</p>
                  <p className="text-xs text-gray-500 mt-1 font-['Space_Mono']">
                    {isAdmin ? 'Publique vagas para que os membros da liga encontrem demandas e projetos.' : 'Novas vagas são publicadas após os check-ins quinzenais com os líderes dos projetos.'}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setIsNewOpeningModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                  >
                    <Plus size={14} /> Publicar Nova Vaga
                  </button>
                )}
              </div>
            ) : (
              filteredOpenings.map(opening => (
                <div
                  key={opening.id || opening.role}
                  className="p-5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] hover:border-amber-500/50 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="text-xs font-bold font-['Space_Mono'] text-amber-400">
                        {opening.projectName}
                      </span>
                      {opening.acceptsBeginners && (
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold font-['Space_Mono']">
                          🌱 Aceita Iniciantes
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-white font-['Syne'] mb-2">
                      {opening.role}
                    </h4>
                    <p className="text-xs text-gray-300 leading-relaxed mb-4">
                      {opening.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-gray-800 flex items-center justify-between text-xs">
                    <span className="text-gray-400 font-['Space_Mono'] text-[11px]">
                      Dedicação: <strong className="text-gray-200 capitalize">{opening.estimatedTime}</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      {canEditGames && (
                        <button
                          type="button"
                          onClick={() => handleBroadcastOpeningEmail(opening)}
                          title="Abrir aba no navegador para divulgar esta vaga aos membros da liga por e-mail"
                          className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs transition-colors cursor-pointer"
                        >
                          <Mail size={13} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => handleDeleteOpening(opening)}
                          title="Excluir vaga"
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          const subject = encodeURIComponent(`Interesse na vaga: ${opening.role} - ${opening.projectName}`);
                          const body = encodeURIComponent(`Olá, diretoria da LAJE!\n\nTenho interesse em participar da vaga de "${opening.role}" no projeto "${opening.projectName}".\n\nNome: ${currentUserName}\nE-mail: ${currentUserEmail}\n\nFico no aguardo do contato!`);
                          window.location.href = `mailto:laje@cin.ufpe.br?subject=${subject}&body=${body}`;
                        }}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-amber-400 hover:text-amber-300 border border-amber-500/30 text-xs font-['Space_Mono'] font-bold transition-colors cursor-pointer"
                      >
                        Tenho Interesse →
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: MURAL DE TAREFAS AVULSAS (MICROTASKS) */}
      {activeSubTab === 'mural' && (
        <div className="space-y-6">
          {/* 4 Rules Header Card */}
          <div className="p-5 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Kanban size={18} className="text-emerald-400" />
                <h4 className="text-sm font-bold text-white font-['Syne'] uppercase tracking-wider">
                  Mural de Tarefas Pequenas e Pontuais
                </h4>
              </div>
              <span className="text-xs font-['Space_Mono'] text-emerald-400">
                Porta de entrada mais fácil da liga
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Pegue uma tarefa sem pedir permissão e sem precisar entrar num time fixo. Entregue, receba retorno em até 3 dias e ganhe seu nome nos créditos do jogo!
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 text-[11px] text-gray-400 border-t border-gray-800">
              <div className="p-2 bg-black/30 border border-gray-800 font-['Space_Mono']">
                <strong className="text-white block mb-0.5">1. Entrega Clara</strong>
                Sem reuniões prévias obrigatórias
              </div>
              <div className="p-2 bg-black/30 border border-gray-800 font-['Space_Mono']">
                <strong className="text-white block mb-0.5">2. Retorno Rápido</strong>
                Feedback em até 3 dias úteis
              </div>
              <div className="p-2 bg-black/30 border border-gray-800 font-['Space_Mono']">
                <strong className="text-white block mb-0.5">3. Não Trava</strong>
                Se ninguém pegar, o jogo segue
              </div>
              <div className="p-2 bg-black/30 border border-gray-800 font-['Space_Mono']">
                <strong className="text-white block mb-0.5">4. Crédito Garantido</strong>
                Seu nome na lista oficial do jogo
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-black/30 border border-[var(--color-ink-faint)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-['Space_Mono'] text-gray-400 mr-2">Área:</span>
              {['all', 'arte', 'código', 'áudio', 'narrativa', 'testes', 'divulgação'].map(area => (
                <button
                  key={area}
                  onClick={() => setTaskAreaFilter(area)}
                  className={`px-2.5 py-1 text-xs font-['Space_Mono'] capitalize transition-colors cursor-pointer ${
                    taskAreaFilter === area 
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold'
                      : 'text-gray-400 hover:text-white bg-gray-900 border border-gray-800'
                  }`}
                >
                  {area === 'all' ? 'Todas' : area}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-300 font-['Space_Mono'] cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskOnlyBeginners}
                  onChange={e => setTaskOnlyBeginners(e.target.checked)}
                  className="rounded border-gray-700 accent-emerald-500"
                />
                Só para iniciantes 🌱
              </label>

              {isAdmin && (
                <button
                  onClick={() => setIsNewTaskModalOpen(true)}
                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                >
                  + Nova Tarefa
                </button>
              )}
            </div>
          </div>

          {/* Tasks Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTasks.length === 0 ? (
              <div className="col-span-full py-16 px-6 text-center border border-dashed border-[var(--color-ink-faint)] bg-black/20 text-gray-400 space-y-4">
                <Kanban size={32} className="mx-auto text-gray-600 mb-2" />
                <div>
                  <p className="text-base font-semibold text-gray-200 font-['Syne']">Nenhuma tarefa pontual no momento</p>
                  <p className="text-xs text-gray-500 mt-1 font-['Space_Mono']">
                    {isAdmin ? 'Crie microtarefas para os membros pegarem e colaborarem de imediato.' : 'Tarefas pequenas serão publicadas pelos projetos conforme as demandas surgirem.'}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => setIsNewTaskModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                  >
                    <Plus size={14} /> Adicionar Nova Tarefa
                  </button>
                )}
              </div>
            ) : (
              filteredTasks.map(task => {
              const isClaimedByMe = task.claimedByEmail === currentUserEmail;
              const isAvailable = task.status === 'aberta';

              return (
                <div
                  key={task.id || task.title}
                  className={`p-4 border transition-all flex flex-col justify-between ${
                    task.status === 'entregue'
                      ? 'bg-emerald-950/10 border-emerald-500/30 opacity-75'
                      : task.status === 'pegaram'
                      ? 'bg-amber-950/10 border-amber-500/30'
                      : 'bg-[rgba(255,255,255,0.02)] border-[var(--color-ink-faint)] hover:border-gray-600'
                  }`}
                >
                  <div>
                    {/* Top tags */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[11px] font-bold font-['Space_Mono'] uppercase tracking-wider text-emerald-400">
                        {task.projectName} • {task.area}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold font-['Space_Mono'] uppercase bg-gray-800 text-gray-300 border border-gray-700">
                        {task.size}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-white font-['Syne'] leading-snug mb-2 line-clamp-2">
                      {task.title}
                    </h4>

                    <p className="text-xs text-gray-300 line-clamp-3 mb-3 leading-relaxed">
                      {task.deliverySpecs}
                    </p>

                    {task.helper && (
                      <p className="text-[11px] text-gray-400 font-['Space_Mono'] mb-3">
                        Tira dúvidas: <strong className="text-gray-200">{task.helper}</strong>
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-800/80 space-y-2">
                    {task.status === 'aberta' && (
                      <button
                        onClick={() => handleClaimTask(task)}
                        className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <UserPlus size={14} /> Pegar Esta Tarefa
                      </button>
                    )}

                    {task.status === 'pegaram' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-['Space_Mono'] text-amber-300">
                          <span>Pegaram: <strong>{task.claimedBy}</strong></span>
                          <span>Em andamento</span>
                        </div>
                        {(isClaimedByMe || isAdmin) && (
                          <button
                            onClick={() => handleDeliverTask(task)}
                            className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-colors cursor-pointer"
                          >
                            Marcar como Entregue ✓
                          </button>
                        )}
                      </div>
                    )}

                    {task.status === 'entregue' && (
                      <div className="flex items-center justify-between text-xs text-emerald-400 font-['Space_Mono']">
                        <span className="flex items-center gap-1"><CheckCircle2 size={14} /> Entregue com sucesso!</span>
                        <Award size={16} />
                      </div>
                    )}

                    {canEditGames && (
                      <button
                        type="button"
                        onClick={() => handleBroadcastTaskEmail(task)}
                        title="Abrir aba no navegador para notificar membros sobre esta microtarefa por e-mail"
                        className="w-full py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-['Space_Mono'] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Mail size={12} /> Divulgar por E-mail
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteTask(task)}
                        title="Excluir tarefa"
                        className="w-full py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-['Space_Mono'] transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} /> Excluir Tarefa
                      </button>
                    )}
                  </div>
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PROPOSTA DE NOVO JOGO */}
      {activeSubTab === 'proposta' && (
        <div className="space-y-8">
          {/* Explanation Banner */}
          <div className="p-5 bg-gradient-to-r from-purple-500/15 via-purple-500/5 to-transparent border border-purple-500/30">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 shrink-0">
                <Sparkles size={22} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white font-['Syne']">
                  Duas Etapas em Vez de Uma: Proposta Leve (10 min)
                </h4>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed whitespace-nowrap overflow-x-auto">
                  Sem burocracia: responda 9 perguntas simples para avaliarmos sua ideia. O GDD completo só é montado após a aprovação.
                </p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmitProposal} className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] space-y-6">
            <h3 className="text-lg font-bold text-white font-['Syne'] pb-3 border-b border-[var(--color-ink-faint)]">
              Formulário de Proposta de Jogo LAJE
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  1. Seu Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={proposalForm.proposerName}
                  onChange={e => setProposalForm({ ...proposalForm, proposerName: e.target.value })}
                  className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  Seu Usuário do Discord *
                </label>
                <input
                  type="text"
                  required
                  placeholder="usuario_discord"
                  value={proposalForm.proposerDiscord}
                  onChange={e => setProposalForm({ ...proposalForm, proposerDiscord: e.target.value.replace(/^@/, '') })}
                  className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                2. Nome Provisório do Projeto *
              </label>
              <p className="text-[11px] text-gray-500 mb-1.5">Pode mudar depois. É só para a gente conseguir falar dele.</p>
              <input
                type="text"
                required
                placeholder="Ex: Depois do Espetáculo"
                value={proposalForm.projectTitle}
                onChange={e => setProposalForm({ ...proposalForm, projectTitle: e.target.value })}
                className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                3. Descreve o Jogo em Uma Frase *
              </label>
              <p className="text-[11px] text-gray-500 mb-1.5">Formato fácil: <em>"É um [gênero] onde você [faz alguma coisa] para [objetivo]"</em>.</p>
              <input
                type="text"
                required
                placeholder="Ex: É um survival horror 2D onde você explora um circo à noite atrás do seu irmão..."
                value={proposalForm.oneSentencePitch}
                onChange={e => setProposalForm({ ...proposalForm, oneSentencePitch: e.target.value })}
                className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  4. Gênero e 2 ou 3 Referências *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Jogos, filmes, séries ou clima que ajudem a imaginar o projeto..."
                  value={proposalForm.genreAndReferences}
                  onChange={e => setProposalForm({ ...proposalForm, genreAndReferences: e.target.value })}
                  className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  5. O que esse jogo tem de diferente? *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Uma ideia central boa vale mais que uma lista de funcionalidades. O que faria alguém querer jogar?"
                  value={proposalForm.differentiation}
                  onChange={e => setProposalForm({ ...proposalForm, differentiation: e.target.value })}
                  className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  6. Engine pretendida *
                </label>
                <select
                  value={proposalForm.engine}
                  onChange={e => setProposalForm({ ...proposalForm, engine: e.target.value })}
                  className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none font-['Space_Mono']"
                >
                  <option value="Godot">Godot Engine</option>
                  <option value="Unity">Unity</option>
                  <option value="Unreal Engine">Unreal Engine</option>
                  <option value="RPG Maker">RPG Maker</option>
                  <option value="Não sei ainda">Ainda não sei (a diretoria ajuda a escolher)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                  7. Tamanho do projeto e prazo *
                </label>
                <select
                  value={proposalForm.projectScopeAndDeadline}
                  onChange={e => setProposalForm({ ...proposalForm, projectScopeAndDeadline: e.target.value })}
                  className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none font-['Space_Mono']"
                >
                  <option value="Protótipo jogável neste semestre">Protótipo jogável neste semestre</option>
                  <option value="Uma fatia completa com arte e som prontos">Uma fatia completa (vertical slice) neste semestre</option>
                  <option value="Jogo curto completo em um semestre">Jogo curto completo em um semestre</option>
                  <option value="Projeto de dois semestres ou mais">Projeto de dois semestres ou mais</option>
                  <option value="Ainda não sei calcular">Ainda não sei calcular</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                8. Quem já está no time e o que falta? *
              </label>
              <textarea
                required
                rows={2}
                placeholder="Ex: Eu estou no Game Design e Roteiro. Falta 1 programador e 1 artista 2D. (Se estiver sozinho, tudo bem, a liga ajuda a achar!)"
                value={proposalForm.teamAndNeeds}
                onChange={e => setProposalForm({ ...proposalForm, teamAndNeeds: e.target.value })}
                className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 uppercase font-['Space_Mono'] mb-1">
                9. Link ou anexo visual (Opcional)
              </label>
              <input
                type="url"
                placeholder="Link para Drive, Miro, Figma, Pinterest ou mockup"
                value={proposalForm.visualAttachmentsUrl}
                onChange={e => setProposalForm({ ...proposalForm, visualAttachmentsUrl: e.target.value })}
                className="w-full bg-[#161619] border border-[var(--color-ink-faint)] p-2.5 text-xs text-white outline-none focus:border-[var(--color-accent)] font-['Space_Mono']"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingProposal}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs uppercase font-['Space_Mono'] transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <Send size={15} />
              {isSubmittingProposal ? 'Enviando Proposta...' : 'Submeter Proposta para Avaliação da Diretoria'}
            </button>
          </form>

          {/* Proposals List for Follow-up */}
          {proposals.length > 0 && (
            <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] space-y-4">
              <h4 className="text-sm font-bold text-white font-['Syne'] uppercase">
                Propostas em Avaliação pela Diretoria ({proposals.length})
              </h4>
              <div className="divide-y divide-gray-800">
                {proposals.map(prop => (
                  <div key={prop.id || prop.projectTitle} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-sm text-white font-['Syne']">{prop.projectTitle}</span>
                        {getStatusBadge(prop.status)}
                      </div>
                      <p className="text-xs text-gray-400">
                        Proposto por <strong className="text-gray-200">{prop.proposerName}</strong> ({prop.proposerDiscord}) • {prop.engine}
                      </p>
                      {prop.boardFeedback && (
                        <p className="text-xs text-amber-300 mt-1 bg-amber-500/10 p-2 border border-amber-500/20">
                          <strong>Retorno da Diretoria:</strong> {prop.boardFeedback}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => setSelectedProposal(prop)}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-['Space_Mono'] border border-gray-700 transition-colors shrink-0 cursor-pointer"
                      >
                        Avaliar Proposta
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: PROJECT DETAILS (GDD DE 1 PÁGINA) */}
      {selectedProject && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onClick={() => setSelectedProject(null)}
        >
          <div 
            className="bg-[#141416] border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-800 mb-6">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{selectedProject.coverEmoji || '🎮'}</span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold text-white font-['Syne']">{selectedProject.name}</h3>
                    {getStatusBadge(selectedProject.status)}
                  </div>
                  <p className="text-xs text-amber-400 font-['Space_Mono'] mt-0.5">
                    {selectedProject.genre} • {selectedProject.engine} • Semestre {selectedProject.semester}
                  </p>
                  {canEditGames && selectedProject.id && (
                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-gray-800/60">
                      <span className="text-[10px] uppercase font-['Space_Mono'] text-gray-400">Alterar Status:</span>
                      <select
                        value={selectedProject.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          if (!selectedProject.id) return;
                          try {
                            await updateDoc(doc(db, 'projects', selectedProject.id), { status: newStatus });
                            setSelectedProject({ ...selectedProject, status: newStatus as any });
                            setProjects(prev => prev.map(p => p.id === selectedProject.id ? { ...p, status: newStatus as any } : p));
                            toast.success(`Status atualizado para "${newStatus}"!`);
                          } catch (err) {
                            console.error(err);
                            toast.error('Erro ao atualizar status');
                          }
                        }}
                        className="bg-[#1b1b1e] border border-gray-700 text-xs text-gray-200 px-2 py-1 font-['Space_Mono'] outline-none cursor-pointer focus:border-emerald-500"
                      >
                        <option value="em andamento">Em Andamento</option>
                        <option value="em produção">Em Produção</option>
                        <option value="concluído">Concluído</option>
                        <option value="pausado">Pausado</option>
                        <option value="aprovado">Aprovado</option>
                        <option value="em análise">Em Análise</option>
                        <option value="ideia">Ideia</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleOpenEditProject(selectedProject)}
                        className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-['Space_Mono'] flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Edit2 size={12} /> Editar Ficha do Jogo
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setSelectedProject(null)}
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* GDD Nível 1 content */}
            <div className="space-y-6 text-xs text-gray-300">
              {/* Elevator Pitch */}
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-[10px] font-bold text-emerald-400 uppercase font-['Space_Mono'] block mb-1">
                  Elevator Pitch (O Jogo em um Parágrafo)
                </span>
                <p className="text-sm text-gray-200 leading-relaxed font-medium">
                  {selectedProject.elevatorPitch || selectedProject.description}
                </p>
              </div>

              {/* Diferencial */}
              {selectedProject.diferencial && (
                <div className="p-4 bg-gray-900 border border-gray-800">
                  <span className="text-[10px] font-bold text-amber-400 uppercase font-['Space_Mono'] block mb-1">
                    O Diferencial
                  </span>
                  <p className="leading-relaxed">{selectedProject.diferencial}</p>
                </div>
              )}

              {/* Pilares de Design */}
              {selectedProject.pilares && (
                <div className="p-4 bg-gray-900 border border-gray-800">
                  <span className="text-[10px] font-bold text-purple-400 uppercase font-['Space_Mono'] block mb-1">
                    Pilares de Design
                  </span>
                  <p className="leading-relaxed whitespace-pre-line">{selectedProject.pilares}</p>
                </div>
              )}

              {/* Escopo e Equipe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-900 border border-gray-800">
                  <span className="text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] block mb-1">
                    Tamanho e Prazo Alvo
                  </span>
                  <p>{selectedProject.targetScope || 'Demo jogável até o fim do semestre'}</p>
                </div>

                <div className="p-4 bg-gray-900 border border-gray-800">
                  <span className="text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] block mb-1">
                    Liderança e Diretoria
                  </span>
                  <p>Líder: <strong className="text-white">{selectedProject.leader}</strong> ({selectedProject.leaderDiscord})</p>
                  <p className="mt-1">Diretor: {selectedProject.responsibleDirector || 'Diretoria de Projetos'}</p>
                </div>
              </div>

              {/* Membros da Equipe (Alocação com Filtro do Dashboard) */}
              <div className="p-4 bg-gray-900 border border-gray-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 flex items-center justify-center">
                      <Users size={16} />
                    </div>
                    <div className="flex flex-col justify-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white font-['Space_Mono'] uppercase tracking-wider leading-none">
                          Membros da Equipe do Jogo
                        </span>
                        <span className="inline-flex items-center px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold font-['Space_Mono'] leading-none">
                          {parseTeamMembersList(selectedProject.teamMembers).length} {parseTeamMembersList(selectedProject.teamMembers).length === 1 ? 'membro' : 'membros'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 font-['Space_Mono'] mt-1 leading-normal">
                        Alocação oficial de integrantes na produção deste projeto
                      </p>
                    </div>
                  </div>

                  {canEditGames && (
                    <button
                      type="button"
                      onClick={() => setIsAddTeamMemberModalOpen(true)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-all shadow-sm shrink-0 cursor-pointer self-start sm:self-auto"
                      title="Adicionar membros da liga usando o filtro do dashboard"
                    >
                      <UserPlus size={13} />
                      + Adicionar Membros (Filtro do Dashboard)
                    </button>
                  )}
                </div>

                {/* Lista de Membros da Equipe */}
                {parseTeamMembersList(selectedProject.teamMembers).length === 0 ? (
                  <div className="py-6 px-4 bg-black/30 border border-dashed border-gray-800 text-center space-y-2.5">
                    <Users size={24} className="mx-auto text-gray-600" />
                    <div>
                      <p className="text-xs font-semibold text-gray-300 font-['Space_Mono']">
                        Nenhum membro adicional cadastrado na equipe além do líder ({selectedProject.leader}).
                      </p>
                      <p className="text-[11px] text-gray-500 max-w-md mx-auto mt-0.5 font-['Space_Mono']">
                        {canEditGames
                          ? 'Super Admins e Membros do RH podem buscar membros por área e disponibilidade através do filtro do Dashboard.'
                          : 'Aguardando alocações de novos integrantes pela diretoria e RH.'}
                      </p>
                    </div>
                    {canEditGames && (
                      <button
                        type="button"
                        onClick={() => setIsAddTeamMemberModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold font-['Space_Mono'] transition-colors cursor-pointer"
                      >
                        <UserPlus size={13} />
                        Buscar Membros no Dashboard
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {parseTeamMembersList(selectedProject.teamMembers).map((item, idx) => {
                      const isLeaderRole = item.isLeader || item.name.toLowerCase() === (selectedProject.leader || '').toLowerCase();
                      const roleLower = item.role.toLowerCase();
                      
                      let roleBadgeClass = 'bg-gray-800 text-gray-300 border-gray-700';
                      let roleIcon = '🎮';
                      if (isLeaderRole) {
                        roleBadgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
                        roleIcon = '👑';
                      } else if (roleLower.includes('dev') || roleLower.includes('prog') || roleLower.includes('código')) {
                        roleBadgeClass = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
                        roleIcon = '💻';
                      } else if (roleLower.includes('art') || roleLower.includes('2d') || roleLower.includes('3d') || roleLower.includes('visual')) {
                        roleBadgeClass = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
                        roleIcon = '🎨';
                      } else if (roleLower.includes('design') || roleLower.includes('level') || roleLower.includes('gd')) {
                        roleBadgeClass = 'bg-pink-500/20 text-pink-300 border-pink-500/40';
                        roleIcon = '🕹️';
                      } else if (roleLower.includes('som') || roleLower.includes('áudio') || roleLower.includes('audio') || roleLower.includes('sfx')) {
                        roleBadgeClass = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
                        roleIcon = '🎵';
                      } else if (roleLower.includes('roteiro') || roleLower.includes('narrativa') || roleLower.includes('história')) {
                        roleBadgeClass = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                        roleIcon = '📜';
                      }

                      return (
                        <div
                          key={`${item.name}-${idx}`}
                          className="p-3 bg-black/40 border border-gray-800/80 hover:border-gray-700 flex items-center justify-between gap-3 transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-200 shrink-0 font-['Space_Mono']">
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-white text-xs truncate max-w-[150px]">
                                  {item.name}
                                </span>
                                <span className={`px-2 py-0.5 text-[10px] border font-['Space_Mono'] flex items-center gap-1 ${roleBadgeClass}`}>
                                  <span>{roleIcon}</span>
                                  <span>{item.role}</span>
                                </span>
                              </div>
                              {item.responseMatch ? (
                                <p className="text-[10px] text-gray-400 font-['Space_Mono'] truncate mt-0.5">
                                  {item.responseMatch.discordUser && <span>@{item.responseMatch.discordUser.replace(/^@/, '')} &bull; </span>}
                                  <span>{item.responseMatch.course || item.responseMatch.email}</span>
                                </p>
                              ) : (
                                <p className="text-[10px] text-gray-500 font-['Space_Mono'] mt-0.5">
                                  Integrante alocado
                                </p>
                              )}
                            </div>
                          </div>

                          {canEditGames && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromCurrentProject(item.raw)}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-70 group-hover:opacity-100 cursor-pointer shrink-0"
                              title={`Remover "${item.name}" da equipe`}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Check-in Status */}
              <div className="p-4 bg-gray-950 border border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] block">
                    Último Check-in Quinzenal
                  </span>
                  <p className="text-xs text-gray-300">
                    Data: <strong className="text-white">{selectedProject.lastCheckInDate || 'Pendente'}</strong>
                  </p>
                  {selectedProject.lastCheckInNotes && (
                    <p className="text-[11px] text-gray-400 mt-1 italic">
                      "{selectedProject.lastCheckInNotes}"
                    </p>
                  )}
                </div>
                {canEditGames && (
                  <button
                    onClick={() => {
                      setCheckInModalProject(selectedProject);
                      setCheckInNotes(selectedProject.lastCheckInNotes || '');
                    }}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-['Space_Mono'] border border-gray-700 cursor-pointer"
                  >
                    Registrar Check-in
                  </button>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {canEditGames && (
                  <button
                    type="button"
                    onClick={() => handleOpenEditProject(selectedProject)}
                    className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-['Space_Mono'] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Edit2 size={13} /> Editar Ficha do Jogo
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(selectedProject)}
                    className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-['Space_Mono'] flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 size={13} /> Excluir Projeto
                  </button>
                )}
                {canEditGames && (
                  <button
                    type="button"
                    onClick={() => handleBroadcastProjectEmail(selectedProject)}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-['Space_Mono'] flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Disparar comunicado por e-mail com todos os membros em cópia oculta (BCC)"
                  >
                    <Mail size={13} /> Notificar Membros por E-mail
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-['Space_Mono'] cursor-pointer"
              >
                Fechar Ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN CHECK-IN */}
      {checkInModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-[#141416] border border-gray-700 p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-bold text-white font-['Syne']">
              Check-in de 15 Minutos: {checkInModalProject.name}
            </h3>
            <p className="text-xs text-gray-400">
              Perguntas de alinhamento: <em>1. O que andou? 2. O que travou? 3. Do que está precisando?</em>
            </p>
            <textarea
              rows={4}
              value={checkInNotes}
              onChange={e => setCheckInNotes(e.target.value)}
              placeholder="Ex: Tarefas da semana concluídas. Travou na programação da IA. Precisando de sound designer para SFX..."
              className="w-full bg-[#161619] border border-gray-700 p-3 text-xs text-white font-['Space_Mono'] outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCheckInModalProject(null)}
                className="px-3 py-1.5 bg-gray-800 text-gray-300 text-xs font-['Space_Mono'] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveCheckIn}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] cursor-pointer"
              >
                Salvar Check-in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN EVALUATE PROPOSAL */}
      {selectedProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="bg-[#141416] border border-gray-700 p-6 max-w-xl w-full space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white font-['Syne']">
                  Avaliação da Diretoria: {selectedProposal.projectTitle}
                </h3>
                <p className="text-xs text-gray-400">
                  Proposto por {selectedProposal.proposerName} ({selectedProposal.proposerEmail})
                </p>
              </div>
              <button onClick={() => setSelectedProposal(null)} className="text-gray-400 p-1"><X size={18} /></button>
            </div>

            <div className="p-3 bg-gray-900 border border-gray-800 text-xs text-gray-300 space-y-1">
              <p><strong>Pitch:</strong> "{selectedProposal.oneSentencePitch}"</p>
              <p><strong>Diferencial:</strong> {selectedProposal.differentiation}</p>
              <p><strong>Escopo:</strong> {selectedProposal.projectScopeAndDeadline}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 font-['Space_Mono'] mb-1">
                Decisão da Diretoria:
              </label>
              <select
                value={evaluationDecision}
                onChange={e => setEvaluationDecision(e.target.value as any)}
                className="w-full bg-[#161619] border border-gray-700 p-2 text-xs text-white font-['Space_Mono']"
              >
                <option value="aprovado">Aprovado (Vira projeto oficial com página e vagas)</option>
                <option value="aprovado com escopo menor">Aprovado com escopo menor (Reduzir tamanho para caber no prazo)</option>
                <option value="precisa de ajustes">Precisa de ajustes (Devolver com perguntas)</option>
                <option value="não aprovado">Não aprovado agora (Com motivo por escrito)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 font-['Space_Mono'] mb-1">
                Parecer / Feedback para o Membro:
              </label>
              <textarea
                rows={3}
                value={evaluationFeedback}
                onChange={e => setEvaluationFeedback(e.target.value)}
                placeholder="Explique os 5 pontos de avaliação (tamanho, clareza, líder, pessoas disponíveis, o que ensina)..."
                className="w-full bg-[#161619] border border-gray-700 p-3 text-xs text-white font-['Space_Mono'] outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedProposal(null)}
                className="px-3 py-1.5 bg-gray-800 text-gray-300 text-xs font-['Space_Mono'] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleEvaluateProposal}
                disabled={isEvaluating}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] cursor-pointer"
              >
                {isEvaluating ? 'Salvando...' : 'Confirmar Decisão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO PROJETO */}
      {isNewProjectModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsNewProjectModalOpen(false)}
        >
          <div 
            className="bg-[#141416] border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <Gamepad2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-['Syne']">Cadastrar Novo Projeto</h3>
                  <p className="text-xs text-gray-400 font-['Space_Mono']">Adicione um jogo oficial da LAJE ao catálogo</p>
                </div>
              </div>
              <button onClick={() => setIsNewProjectModalOpen(false)} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs font-['Space_Mono']">
              {/* Emoji Selector */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Emoji de Capa</label>
                <div className="flex flex-wrap gap-2">
                  {['🎮', '⚔️', '🚀', '🎪', '⚡', '🌿', '🧩', '🎲', '👾', '🕹️', '🏰', '🏎️', '🧙'].map(emoji => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setNewProjectForm({ ...newProjectForm, coverEmoji: emoji })}
                      className={`text-xl p-2 rounded border cursor-pointer transition-all ${
                        newProjectForm.coverEmoji === emoji
                          ? 'bg-emerald-500/20 border-emerald-500 text-white scale-110'
                          : 'bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-300'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Nome do Projeto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Depois do Espetáculo"
                    value={newProjectForm.name}
                    onChange={e => setNewProjectForm({ ...newProjectForm, name: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Status Inicial</label>
                  <select
                    value={newProjectForm.status}
                    onChange={e => setNewProjectForm({ ...newProjectForm, status: e.target.value as any })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                  >
                    <option value="em andamento">Em Andamento</option>
                    <option value="em produção">Em Produção</option>
                    <option value="concluído">Concluído</option>
                    <option value="pausado">Pausado</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="em análise">Em Análise</option>
                    <option value="ideia">Ideia</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Gênero</label>
                  <input
                    type="text"
                    placeholder="Ex: Metroidvania, RPG..."
                    value={newProjectForm.genre}
                    onChange={e => setNewProjectForm({ ...newProjectForm, genre: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Engine</label>
                  <select
                    value={newProjectForm.engine}
                    onChange={e => setNewProjectForm({ ...newProjectForm, engine: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                  >
                    <option value="Godot">Godot</option>
                    <option value="Unity">Unity</option>
                    <option value="Unreal Engine">Unreal Engine</option>
                    <option value="RPG Maker">RPG Maker</option>
                    <option value="GameMaker">GameMaker</option>
                    <option value="Outra">Outra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Semestre</label>
                  <input
                    type="text"
                    placeholder="2026.2"
                    value={newProjectForm.semester}
                    onChange={e => setNewProjectForm({ ...newProjectForm, semester: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Líder do Projeto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo do líder"
                    value={newProjectForm.leader}
                    onChange={e => setNewProjectForm({ ...newProjectForm, leader: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Discord do Líder</label>
                  <input
                    type="text"
                    placeholder="usuario_discord"
                    value={newProjectForm.leaderDiscord}
                    onChange={e => setNewProjectForm({ ...newProjectForm, leaderDiscord: e.target.value.replace(/^@/, '') })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Descrição Resumida *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Resumo do conceito do jogo..."
                  value={newProjectForm.description}
                  onChange={e => setNewProjectForm({ ...newProjectForm, description: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Elevator Pitch (O Jogo em 1 Frase/Parágrafo)</label>
                <textarea
                  rows={2}
                  placeholder="É um [gênero] onde você [ação] para [objetivo]..."
                  value={newProjectForm.elevatorPitch}
                  onChange={e => setNewProjectForm({ ...newProjectForm, elevatorPitch: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">O Diferencial</label>
                  <input
                    type="text"
                    placeholder="Mecânica central única ou elemento narrativo..."
                    value={newProjectForm.diferencial}
                    onChange={e => setNewProjectForm({ ...newProjectForm, diferencial: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Escopo Alvo</label>
                  <input
                    type="text"
                    placeholder="Ex: Demo jogável de 20 minutos neste semestre"
                    value={newProjectForm.targetScope}
                    onChange={e => setNewProjectForm({ ...newProjectForm, targetScope: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Membros da Equipe</label>
                <input
                  type="text"
                  placeholder="Ex: Maria (Líder), Lucas (Dev), Sofia (Arte)..."
                  value={newProjectForm.teamMembers}
                  onChange={e => setNewProjectForm({ ...newProjectForm, teamMembers: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              {/* Automatic Email Notification Box */}
              <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded space-y-1.5">
                <label className="flex items-center gap-2.5 cursor-pointer text-emerald-300 font-bold text-xs select-none">
                  <input
                    type="checkbox"
                    checked={newProjectForm.notifyMembers}
                    onChange={e => setNewProjectForm({ ...newProjectForm, notifyMembers: e.target.checked })}
                    className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <Mail size={15} className="text-emerald-400" />
                    Enviar e-mail automático notificando todos os membros da LAJE
                  </span>
                </label>
                <p className="text-[11px] text-gray-400 pl-6 leading-relaxed">
                  Os membros cadastrados receberão um e-mail com a ficha técnica, sinopse, diferencial e link para conferir o projeto e vagas abertas no portal.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsNewProjectModalOpen(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProject}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold cursor-pointer"
                >
                  {isSubmittingProject ? 'Cadastrando...' : 'Cadastrar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR JOGO / PROJETO */}
      {isEditProjectModalOpen && editingProject && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => {
            setIsEditProjectModalOpen(false);
            setEditingProject(null);
          }}
        >
          <div 
            className="bg-[#141416] border border-emerald-500/40 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-['Syne']">Editar Ficha do Jogo</h3>
                  <p className="text-xs text-emerald-400/90 font-['Space_Mono']">
                    Modo Edição RH &bull; {editingProject.name}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsEditProjectModalOpen(false);
                  setEditingProject(null);
                }} 
                className="text-gray-400 hover:text-white p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEditProject} className="space-y-4 text-xs font-['Space_Mono']">
              {/* Emoji Selector */}
              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Emoji de Capa</label>
                <div className="flex flex-wrap gap-2">
                  {['🎮', '⚔️', '🚀', '🎪', '⚡', '🌿', '🧩', '🎲', '👾', '🕹️', '🏰', '🏎️', '🧙'].map(emoji => (
                    <button
                      type="button"
                      key={emoji}
                      onClick={() => setEditProjectForm({ ...editProjectForm, coverEmoji: emoji })}
                      className={`text-xl p-2 rounded border cursor-pointer transition-all ${
                        editProjectForm.coverEmoji === emoji
                          ? 'bg-emerald-500/20 border-emerald-500 text-white scale-110'
                          : 'bg-gray-900 border-gray-800 hover:bg-gray-800 text-gray-300'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Nome do Jogo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Depois do Espetáculo"
                    value={editProjectForm.name}
                    onChange={e => setEditProjectForm({ ...editProjectForm, name: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Status Atual</label>
                  <select
                    value={editProjectForm.status}
                    onChange={e => setEditProjectForm({ ...editProjectForm, status: e.target.value as any })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="em andamento">Em Andamento</option>
                    <option value="em produção">Em Produção</option>
                    <option value="concluído">Concluído</option>
                    <option value="pausado">Pausado</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="em análise">Em Análise</option>
                    <option value="ideia">Ideia</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Gênero</label>
                  <input
                    type="text"
                    placeholder="Ex: Metroidvania, RPG..."
                    value={editProjectForm.genre}
                    onChange={e => setEditProjectForm({ ...editProjectForm, genre: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Engine</label>
                  <select
                    value={editProjectForm.engine}
                    onChange={e => setEditProjectForm({ ...editProjectForm, engine: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="Godot">Godot</option>
                    <option value="Unity">Unity</option>
                    <option value="Unreal Engine">Unreal Engine</option>
                    <option value="RPG Maker">RPG Maker</option>
                    <option value="GameMaker">GameMaker</option>
                    <option value="Outra">Outra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Semestre</label>
                  <input
                    type="text"
                    placeholder="2026.2"
                    value={editProjectForm.semester}
                    onChange={e => setEditProjectForm({ ...editProjectForm, semester: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Líder do Projeto *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nome completo do líder"
                    value={editProjectForm.leader}
                    onChange={e => setEditProjectForm({ ...editProjectForm, leader: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Discord do Líder</label>
                  <input
                    type="text"
                    placeholder="usuario_discord"
                    value={editProjectForm.leaderDiscord}
                    onChange={e => setEditProjectForm({ ...editProjectForm, leaderDiscord: e.target.value.replace(/^@/, '') })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Descrição Resumida</label>
                <textarea
                  rows={2}
                  placeholder="Resumo do conceito do jogo..."
                  value={editProjectForm.description}
                  onChange={e => setEditProjectForm({ ...editProjectForm, description: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Elevator Pitch (O Jogo em 1 Frase/Parágrafo)</label>
                <textarea
                  rows={2}
                  placeholder="É um [gênero] onde você [ação] para [objetivo]..."
                  value={editProjectForm.elevatorPitch}
                  onChange={e => setEditProjectForm({ ...editProjectForm, elevatorPitch: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">O Diferencial</label>
                  <input
                    type="text"
                    placeholder="Mecânica central única ou elemento narrativo..."
                    value={editProjectForm.diferencial}
                    onChange={e => setEditProjectForm({ ...editProjectForm, diferencial: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Escopo Alvo</label>
                  <input
                    type="text"
                    placeholder="Ex: Demo jogável de 20 minutos neste semestre"
                    value={editProjectForm.targetScope}
                    onChange={e => setEditProjectForm({ ...editProjectForm, targetScope: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Membros da Equipe</label>
                <input
                  type="text"
                  placeholder="Ex: Maria (Líder), Lucas (Dev), Sofia (Arte)..."
                  value={editProjectForm.teamMembers}
                  onChange={e => setEditProjectForm({ ...editProjectForm, teamMembers: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditProjectModalOpen(false);
                    setEditingProject(null);
                  }}
                  className="px-4 py-2 bg-gray-800 text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProjectEdit}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingProjectEdit ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA VAGA */}
      {isNewOpeningModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsNewOpeningModalOpen(false)}
        >
          <div 
            className="bg-[#141416] border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-['Syne']">Publicar Vaga Aberta</h3>
                  <p className="text-xs text-gray-400 font-['Space_Mono']">Demanda concreta para membros da liga</p>
                </div>
              </div>
              <button onClick={() => setIsNewOpeningModalOpen(false)} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateOpening} className="space-y-4 text-xs font-['Space_Mono']">
              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Projeto Vinculado *</label>
                {projects.length === 0 ? (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                    Nenhum projeto cadastrado ainda. A vaga será vinculada a "Projeto Geral da Liga" até você criar um projeto.
                  </div>
                ) : (
                  <select
                    value={newOpeningForm.projectId || projects[0]?.id}
                    onChange={e => setNewOpeningForm({ ...newOpeningForm, projectId: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.genre})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Função / Título da Vaga *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Artista 2D para tileset e sprites"
                  value={newOpeningForm.role}
                  onChange={e => setNewOpeningForm({ ...newOpeningForm, role: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Descrição da Demanda *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o que será feito com especificações claras..."
                  value={newOpeningForm.description}
                  onChange={e => setNewOpeningForm({ ...newOpeningForm, description: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Dedicação Semanal Estimada</label>
                <select
                  value={newOpeningForm.estimatedTime}
                  onChange={e => setNewOpeningForm({ ...newOpeningForm, estimatedTime: e.target.value as any })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                >
                  <option value="pouco">Pouco (2h a 4h por semana)</option>
                  <option value="médio">Médio (4h a 8h por semana)</option>
                  <option value="bastante">Bastante (8h+ por semana)</option>
                </select>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-gray-200">
                  <input
                    type="checkbox"
                    checked={newOpeningForm.acceptsBeginners}
                    onChange={e => setNewOpeningForm({ ...newOpeningForm, acceptsBeginners: e.target.checked })}
                    className="rounded accent-emerald-500"
                  />
                  <span>🌱 Aceita Iniciantes (Membros sem experiência prévia)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsNewOpeningModalOpen(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOpening}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold cursor-pointer"
                >
                  {isSubmittingOpening ? 'Publicando...' : 'Publicar Vaga'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVA TAREFA (MURAL) */}
      {isNewTaskModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setIsNewTaskModalOpen(false)}
        >
          <div 
            className="bg-[#141416] border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-gray-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  <Kanban size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white font-['Syne']">Adicionar Tarefa ao Mural</h3>
                  <p className="text-xs text-gray-400 font-['Space_Mono']">Microtarefa pontual para qualquer membro pegar</p>
                </div>
              </div>
              <button onClick={() => setIsNewTaskModalOpen(false)} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs font-['Space_Mono']">
              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Título da Tarefa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 4 efeitos sonoros de passos e rangidos"
                  value={newTaskForm.title}
                  onChange={e => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Projeto Vinculado</label>
                  <select
                    value={newTaskForm.projectId || projects[0]?.id}
                    onChange={e => setNewTaskForm({ ...newTaskForm, projectId: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                  >
                    {projects.length === 0 ? (
                      <option value="geral">Geral da Liga</option>
                    ) : (
                      projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Área</label>
                  <select
                    value={newTaskForm.area}
                    onChange={e => setNewTaskForm({ ...newTaskForm, area: e.target.value as any })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                  >
                    <option value="arte">Arte</option>
                    <option value="código">Código</option>
                    <option value="áudio">Áudio</option>
                    <option value="narrativa">Narrativa</option>
                    <option value="testes">Testes / Playtest</option>
                    <option value="divulgação">Divulgação</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-semibold mb-1 uppercase">Especificação da Entrega *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ex: Arquivos .WAV 44.1kHz salvos na pasta /SFX do Drive..."
                  value={newTaskForm.deliverySpecs}
                  onChange={e => setNewTaskForm({ ...newTaskForm, deliverySpecs: e.target.value })}
                  className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Tamanho</label>
                  <select
                    value={newTaskForm.size}
                    onChange={e => setNewTaskForm({ ...newTaskForm, size: e.target.value as any })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none"
                  >
                    <option value="pequena">Pequena (1-2h)</option>
                    <option value="média">Média (3-6h)</option>
                    <option value="grande">Grande (7h+)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Quem Tira Dúvidas</label>
                  <input
                    type="text"
                    placeholder="Nome ou Discord"
                    value={newTaskForm.helper}
                    onChange={e => setNewTaskForm({ ...newTaskForm, helper: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2.5 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-semibold mb-1 uppercase">Prazo (Data)</label>
                  <input
                    type="date"
                    value={newTaskForm.deadline}
                    onChange={e => setNewTaskForm({ ...newTaskForm, deadline: e.target.value })}
                    className="w-full bg-[#161619] border border-gray-700 p-2 text-xs text-white outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-gray-200">
                  <input
                    type="checkbox"
                    checked={newTaskForm.beginnerFriendly}
                    onChange={e => setNewTaskForm({ ...newTaskForm, beginnerFriendly: e.target.checked })}
                    className="rounded accent-emerald-500"
                  />
                  <span>🌱 Amigável para iniciantes</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold cursor-pointer"
                >
                  {isSubmittingTask ? 'Salvando...' : 'Adicionar ao Mural'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR MEMBROS DA EQUIPE VIA FILTRO DO DASHBOARD */}
      {isAddTeamMemberModalOpen && selectedProject && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsAddTeamMemberModalOpen(false)}
        >
          <div 
            className="bg-[#141416] border border-emerald-500/40 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-left"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-5 border-b border-gray-800 bg-black/40 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                  <UserPlus size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white font-['Syne'] uppercase">
                      Adicionar Membros à Equipe
                    </h3>
                    <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-['Space_Mono'] font-bold">
                      {selectedProject.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-['Space_Mono'] mt-0.5">
                    Filtro oficial do Dashboard para busca por nome, área/função e disponibilidade
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAddTeamMemberModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Filtros idênticos ao Dashboard */}
            <div className="p-5 bg-[rgba(255,255,255,0.02)] border-b border-gray-800 space-y-3 shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Busca textual */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1.5">
                    <Search size={12} className="text-emerald-400" />
                    <span>Nome ou E-mail</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Ex: Clara, Lucas, @ufpe.br..."
                      value={teamMemberSearch}
                      onChange={e => setTeamMemberSearch(e.target.value)}
                      className="w-full bg-[#161619] border border-gray-700 py-2 pl-2.5 pr-7 text-xs text-white font-['Space_Mono'] outline-none focus:border-emerald-500"
                    />
                    {teamMemberSearch && (
                      <button
                        type="button"
                        onClick={() => setTeamMemberSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Função na Liga */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1.5">
                    <Briefcase size={12} className="text-emerald-400" />
                    <span>Função na Liga</span>
                  </label>
                  <select
                    value={teamMemberRoleFilter}
                    onChange={e => setTeamMemberRoleFilter(e.target.value)}
                    className="w-full bg-[#161619] border border-gray-700 py-2 px-2.5 text-xs text-white font-['Space_Mono'] outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todas as Funções ({allResponses.length})</option>
                    {distinctMemberRoles.map(role => {
                      const count = allResponses.filter(m => (m.leagueRole || '').toLowerCase().includes(role.toLowerCase())).length;
                      return (
                        <option key={role} value={role}>{role} ({count})</option>
                      );
                    })}
                  </select>
                </div>

                {/* 3. Status de Projeto */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1.5">
                    <Gamepad2 size={12} className="text-emerald-400" />
                    <span>Status de Projeto</span>
                  </label>
                  <select
                    value={teamMemberProjectStatusFilter}
                    onChange={e => setTeamMemberProjectStatusFilter(e.target.value)}
                    className="w-full bg-[#161619] border border-gray-700 py-2 px-2.5 text-xs text-white font-['Space_Mono'] outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">Todos os Status</option>
                    <option value="waiting_invite">⏳ Quer Entrar / Aguardando</option>
                    <option value="no_project">⚪ Sem Projeto / Disponíveis</option>
                    <option value="in_project">🎮 Já em Projeto</option>
                    <option value="observing">🔍 Observando</option>
                  </select>
                </div>

                {/* 4. Situação Cadastral */}
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase font-['Space_Mono'] mb-1 flex items-center gap-1.5">
                    <Users size={12} className="text-emerald-400" />
                    <span>Situação</span>
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={teamMemberStatusFilter}
                      onChange={e => setTeamMemberStatusFilter(e.target.value as any)}
                      className="flex-1 bg-[#161619] border border-gray-700 py-2 px-2 text-xs text-white font-['Space_Mono'] outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="all">Todos</option>
                      <option value="active">Ativos</option>
                      <option value="former">Ex-membros</option>
                    </select>
                    {(teamMemberSearch || teamMemberRoleFilter !== 'all' || teamMemberProjectStatusFilter !== 'all' || teamMemberStatusFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setTeamMemberSearch('');
                          setTeamMemberRoleFilter('all');
                          setTeamMemberProjectStatusFilter('all');
                          setTeamMemberStatusFilter('all');
                        }}
                        className="px-2 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-['Space_Mono'] cursor-pointer"
                        title="Limpar filtros"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Atalhos Rápidos de Filtro */}
              <div className="pt-2 border-t border-gray-800/60 flex flex-wrap items-center gap-1.5 text-xs font-['Space_Mono']">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mr-1 flex items-center gap-1">
                  <SlidersHorizontal size={11} /> Atalhos:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTeamMemberSearch('');
                    setTeamMemberRoleFilter('all');
                    setTeamMemberProjectStatusFilter('all');
                  }}
                  className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                    teamMemberRoleFilter === 'all' && teamMemberProjectStatusFilter === 'all'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setTeamMemberProjectStatusFilter(teamMemberProjectStatusFilter === 'waiting_invite' ? 'all' : 'waiting_invite')}
                  className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                    teamMemberProjectStatusFilter === 'waiting_invite'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  ⏳ Quer Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setTeamMemberRoleFilter(teamMemberRoleFilter.toLowerCase().includes('program') ? 'all' : 'Programação')}
                  className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                    teamMemberRoleFilter.toLowerCase().includes('program')
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  💻 Programação
                </button>
                <button
                  type="button"
                  onClick={() => setTeamMemberRoleFilter(teamMemberRoleFilter.toLowerCase().includes('arte') ? 'all' : 'Arte')}
                  className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                    teamMemberRoleFilter.toLowerCase().includes('arte')
                      ? 'bg-purple-500/20 border-purple-500 text-purple-300 font-bold'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  🎨 Arte
                </button>
                <button
                  type="button"
                  onClick={() => setTeamMemberRoleFilter(teamMemberRoleFilter.toLowerCase().includes('game design') ? 'all' : 'Game Design')}
                  className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                    teamMemberRoleFilter.toLowerCase().includes('game design')
                      ? 'bg-pink-500/20 border-pink-500 text-pink-300 font-bold'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  🕹️ Game Design
                </button>
                <button
                  type="button"
                  onClick={() => setTeamMemberRoleFilter(teamMemberRoleFilter.toLowerCase().includes('som') || teamMemberRoleFilter.toLowerCase().includes('áudio') ? 'all' : 'Som')}
                  className={`px-2 py-0.5 text-[11px] border cursor-pointer transition-colors ${
                    teamMemberRoleFilter.toLowerCase().includes('som') || teamMemberRoleFilter.toLowerCase().includes('áudio')
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  🎵 Som / Áudio
                </button>
              </div>

              {/* Contador de resultados */}
              <div className="flex items-center justify-between text-[11px] font-['Space_Mono'] text-gray-400 pt-1">
                <span>
                  Exibindo <strong className="text-emerald-400">{filteredAddMembers.length}</strong> de {allResponses.length} membros
                </span>
                <span className="text-[10px] text-gray-500">
                  Defina a função específica e clique em "Adicionar ao Projeto"
                </span>
              </div>
            </div>

            {/* Lista com scroll dos membros filtrados */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[50vh]">
              {filteredAddMembers.length === 0 ? (
                <div className="py-12 text-center text-gray-400 font-['Space_Mono'] space-y-2">
                  <p className="text-sm">Nenhum membro encontrado com os filtros selecionados.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setTeamMemberSearch('');
                      setTeamMemberRoleFilter('all');
                      setTeamMemberProjectStatusFilter('all');
                      setTeamMemberStatusFilter('all');
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                  >
                    Redefinir Filtros
                  </button>
                </div>
              ) : (
                filteredAddMembers.map(member => {
                  const alreadyInTeam = isMemberInProject(member.name, selectedProject.teamMembers);
                  const isCurrentSubmitting = Boolean(isSubmittingMemberAdd[member.id]);
                  const defaultRole = memberAssignedRoles[member.id] || (member.leagueRole ? String(member.leagueRole).split(',')[0].trim() : 'Equipe');

                  return (
                    <div
                      key={member.id}
                      className={`p-4 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        alreadyInTeam
                          ? 'bg-emerald-950/15 border-emerald-500/40'
                          : 'bg-black/40 border-gray-800 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-sm font-bold text-emerald-400 shrink-0 font-['Space_Mono']">
                          {(member.name || 'M').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">
                              {member.name}
                            </span>
                            {member.discordUser && (
                              <span className="text-[11px] text-gray-400 font-['Space_Mono']">
                                @{member.discordUser.replace(/^@/, '')}
                              </span>
                            )}
                            {alreadyInTeam && (
                              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold font-['Space_Mono'] flex items-center gap-1">
                                <Check size={11} /> Já na Equipe
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-['Space_Mono']">
                            <span className="text-gray-400">
                              {member.course || 'Curso não informado'} {member.period ? `(${member.period})` : ''}
                            </span>
                            <span className="text-gray-600">&bull;</span>
                            <span className="text-emerald-400/90">
                              {member.email}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            {String(member.leagueRole || 'Geral').split(',').map((r: string, rIdx: number) => (
                              <span
                                key={rIdx}
                                className="px-2 py-0.5 bg-gray-900 border border-gray-700 text-gray-300 text-[10px] font-['Space_Mono'] rounded-sm"
                              >
                                {r.trim()}
                              </span>
                            ))}
                            {member.weeklyHours && (
                              <span className="px-1.5 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-['Space_Mono']">
                                ⏱️ {member.weeklyHours}
                              </span>
                            )}
                            {member.isInProject === 'Sim' ? (
                              <span className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-['Space_Mono']">
                                🎮 Em: {member.currentProjects || 'Projeto'}
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-['Space_Mono']">
                                ⏳ Disponível / Sem Projeto
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Controle de Função & Ação de Adicionar */}
                      <div className="flex sm:flex-col items-end gap-2 shrink-0 self-stretch sm:self-auto justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-800">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] font-['Space_Mono'] text-gray-400 uppercase hidden sm:inline">
                            Papel:
                          </label>
                          <input
                            type="text"
                            placeholder="Papel no jogo..."
                            disabled={alreadyInTeam}
                            value={memberAssignedRoles[member.id] !== undefined ? memberAssignedRoles[member.id] : defaultRole}
                            onChange={e => setMemberAssignedRoles({ ...memberAssignedRoles, [member.id]: e.target.value })}
                            className="bg-[#161619] border border-gray-700 px-2 py-1 text-xs text-white font-['Space_Mono'] w-36 outline-none focus:border-emerald-500 disabled:opacity-50"
                          />
                        </div>

                        {alreadyInTeam ? (
                          <button
                            type="button"
                            disabled
                            className="px-3.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold font-['Space_Mono'] flex items-center gap-1.5 cursor-not-allowed opacity-80"
                          >
                            <Check size={13} />
                            Alocado
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isCurrentSubmitting}
                            onClick={() => handleAddMemberToCurrentProject(member, memberAssignedRoles[member.id] || defaultRole)}
                            className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                          >
                            <UserPlus size={13} />
                            {isCurrentSubmitting ? 'Adicionando...' : '+ Adicionar à Equipe'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer do Modal */}
            <div className="p-4 border-t border-gray-800 bg-black/40 flex items-center justify-between shrink-0">
              <span className="text-xs font-['Space_Mono'] text-gray-400">
                Projeto atual: <strong className="text-white">{selectedProject.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => setIsAddTeamMemberModalOpen(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-['Space_Mono'] font-bold cursor-pointer transition-colors"
              >
                Concluir & Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ENVIO MANUAL DE E-MAILS (GMAIL WEB & CLIENTE LOCAL) */}
      <ManualEmailModal
        email={emailModalData}
        onClose={() => setEmailModalData(null)}
      />
    </div>
  );
}
