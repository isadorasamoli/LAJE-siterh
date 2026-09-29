/**
 * Módulo de Envio Manual de E-mails via Navegador (Gmail Web & Mailto)
 * Permite que Super Admin e Membros do RH abram uma aba no navegador com
 * destinatários (BCC), assunto e corpo pré-preenchidos para envio manual
 * confiável de Boas-Vindas, Eventos, Projetos Novos, Vagas e Mural de Tarefas.
 */

export interface EmailPayload {
  to?: string;
  bcc?: string[];
  subject: string;
  body: string;
  category: 'welcome' | 'event' | 'project' | 'opening' | 'task';
  title: string;
}

/**
 * Monta as URLs para o navegador e dispara a abertura de uma nova aba
 */
export const openManualEmailInBrowser = (payload: {
  to?: string;
  bcc?: string[];
  subject: string;
  body: string;
}) => {
  const to = (payload.to || '').trim();
  const bccList = (payload.bcc || [])
    .map(e => (e || '').trim().toLowerCase())
    .filter(e => e && e.includes('@'));
  const bcc = Array.from(new Set(bccList)).join(',');
  const subject = payload.subject;
  const body = payload.body;

  // 1. URL do Gmail Web Composer (abre nova aba com tudo pronto no Gmail)
  let gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1`;
  if (to) gmailUrl += `&to=${encodeURIComponent(to)}`;
  if (bcc) gmailUrl += `&bcc=${encodeURIComponent(bcc)}`;
  if (subject) gmailUrl += `&su=${encodeURIComponent(subject)}`;
  if (body) gmailUrl += `&body=${encodeURIComponent(body)}`;

  // 2. URL de fallback padrão mailto
  let mailtoUrl = `mailto:${encodeURIComponent(to)}?`;
  const mailtoParams: string[] = [];
  if (bcc) mailtoParams.push(`bcc=${encodeURIComponent(bcc)}`);
  if (subject) mailtoParams.push(`subject=${encodeURIComponent(subject)}`);
  if (body) mailtoParams.push(`body=${encodeURIComponent(body)}`);
  mailtoUrl += mailtoParams.join('&');

  // Abre a aba com Gmail Web (padrão confiável no navegador sem depender de cliente local)
  try {
    const link = document.createElement('a');
    link.href = gmailUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.warn('Erro ao abrir link no navegador via âncora:', err);
    window.open(gmailUrl, '_blank', 'noopener,noreferrer');
  }

  return {
    gmailUrl,
    mailtoUrl,
    to,
    bccList,
    bcc,
    subject,
    body
  };
};

/**
 * 1. E-mail de Boas-Vindas para novo membro da LAJE
 */
export const buildWelcomeEmail = (
  member: { name: string; email: string; leagueRole?: string; course?: string },
  upcomingEvents: any[] = []
): EmailPayload => {
  const name = member.name || 'Membro';
  const role = member.leagueRole || 'Integrante da Liga';
  
  let eventsText = '';
  if (upcomingEvents.length > 0) {
    eventsText = `\n\n📅 PRÓXIMOS EVENTOS NO CALENDÁRIO:\n` +
      upcomingEvents.slice(0, 3).map(ev => {
        const d = new Date(ev.date);
        return `• ${ev.title} — ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (${ev.duration || '1h'})`;
      }).join('\n');
  }

  const subject = `[LAJE] Boas-vindas à Liga Acadêmica de Jogos Eletrônicos! 🎮`;
  const body = 
`Olá, ${name}!

Seja muito bem-vindo(a) à LAJE (Liga Acadêmica de Jogos Eletrônicos da UFPE)!

Estamos muito empolgados em ter você com a gente${role ? ` atuando como ${role}` : ''}.

A LAJE é um espaço colaborativo de desenvolvimento de jogos, aprendizado prático e criação de projetos reais. Nosso objetivo é que você ganhe experiência em produção de games, publique projetos no seu portfólio e trabalhe em equipe.

O QUE FAZER AGORA:
1. 🌐 Acesse a plataforma da LAJE para acompanhar o mural de tarefas e projetos:
https://ais-pre-qbm74e6dhvznyugdy4uwmp-220243259932.us-west2.run.app

2. 🚀 Conheça os Projetos Oficiais e candidate-se às vagas abertas ou pegue tarefas no mural de tarefas pontuais.

3. 👥 Entre em contato com a equipe no Discord oficial da LAJE.${eventsText}

Qualquer dúvida, conte com a diretoria e com o time de Recursos Humanos da LAJE!

Um grande abraço e ótimo semestre de criação,
— Diretoria & Recursos Humanos da LAJE (Liga Acadêmica de Jogos Eletrônicos)`;

  return {
    to: member.email,
    subject,
    body,
    category: 'welcome',
    title: `Boas-vindas: ${name}`
  };
};

/**
 * 2. E-mail de Notificação de Evento no Calendário
 */
export const buildEventEmail = (
  event: { title: string; date: string; duration?: string; description?: string },
  type: 'create' | 'update' | 'delete',
  memberEmails: string[]
): EmailPayload => {
  const isDelete = type === 'delete';
  const isUpdate = type === 'update';
  const d = new Date(event.date);
  const dateStr = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const statusPrefix = isDelete ? '🚨 CANCELADO' : isUpdate ? '🔄 ATUALIZADO' : '📅 NOVO EVENTO';
  const subject = `[LAJE] ${statusPrefix}: ${event.title} (${d.toLocaleDateString('pt-BR')})`;

  const body = 
`Olá, membros da LAJE!

${isDelete 
  ? `Informamos que o seguinte evento agendado foi CANCELADO:` 
  : isUpdate 
  ? `Houve uma ATUALIZAÇÃO em um evento do nosso calendário:` 
  : `Um novo evento foi adicionado ao calendário oficial da LAJE:`}

📌 EVENTO: ${event.title}
📆 DATA: ${dateStr}
⏰ HORÁRIO: ${timeStr} (${event.duration || '1 hora'})
${event.description ? `\n📝 DESCRIÇÃO & DETALHES:\n${event.description}\n` : ''}
${!isDelete ? `Acesse o portal da LAJE para ver o calendário completo e sincronizar com seu Google Agenda:\nhttps://ais-pre-qbm74e6dhvznyugdy4uwmp-220243259932.us-west2.run.app\n` : ''}
Contamos com a participação de todos!

— Diretoria de Eventos & RH da LAJE`;

  return {
    bcc: memberEmails,
    subject,
    body,
    category: 'event',
    title: `${statusPrefix}: ${event.title}`
  };
};

/**
 * 3. E-mail de Novo Projeto de Jogo Cadastrado
 */
export const buildProjectEmail = (
  project: {
    name: string;
    genre: string;
    engine: string;
    leader: string;
    leaderDiscord?: string;
    description: string;
    elevatorPitch?: string;
    diferencial?: string;
    targetScope?: string;
    semester?: string;
    coverEmoji?: string;
  },
  memberEmails: string[]
): EmailPayload => {
  const emoji = project.coverEmoji || '🎮';
  const subject = `[LAJE] Novo Jogo em Produção: ${project.name} ${emoji}`;

  const body = 
`Olá, membros da LAJE!

Temos o prazer de anunciar um NOVO PROJETO oficial entrando em produção na liga!

${emoji} JOGO: ${project.name}
🕹️ GÊNERO: ${project.genre}
⚙️ ENGINE: ${project.engine}
👤 LÍDER: ${project.leader} ${project.leaderDiscord ? `(Discord: ${project.leaderDiscord})` : ''}
📅 SEMESTRE: ${project.semester || '2026.2'}

📖 O JOGO EM UM PARÁGRAFO:
${project.elevatorPitch || project.description}
${project.diferencial ? `\n✨ DIFERENCIAL DO JOGO:\n${project.diferencial}\n` : ''}
${project.targetScope ? `🎯 ESCOPO & META: ${project.targetScope}\n` : ''}
COMO PARTICIPAR:
Acesse o portal da LAJE na aba "Projetos & Vagas" para ver a ficha completa do jogo, conferir vagas abertas ou pegar microtarefas deste projeto no mural!

🔗 Link direto do portal:
https://ais-pre-qbm74e6dhvznyugdy4uwmp-220243259932.us-west2.run.app

Vamos juntos criar jogos incríveis!

— Diretoria de Projetos & RH da LAJE`;

  return {
    bcc: memberEmails,
    subject,
    body,
    category: 'project',
    title: `Novo Projeto: ${project.name}`
  };
};

/**
 * 4. E-mail de Divulgação de Vaga Aberta em Projeto
 */
export const buildOpeningEmail = (
  opening: {
    role: string;
    projectName: string;
    description: string;
    estimatedTime?: string;
    acceptsBeginners?: boolean;
  },
  memberEmails: string[]
): EmailPayload => {
  const subject = `[LAJE] Nova Vaga Aberta: ${opening.role} — ${opening.projectName} 🚀`;

  const body = 
`Olá, membros da LAJE!

Uma nova oportunidade de atuação acaba de ser aberta no projeto "${opening.projectName}"!

💼 VAGA: ${opening.role}
🎮 PROJETO: ${opening.projectName}
⏱️ DEDICAÇÃO ESTIMADA: ${opening.estimatedTime || 'Média'}
${opening.acceptsBeginners ? `🌱 PERFIL: Aceita iniciantes (ótima oportunidade para aprender na prática!)` : `🛠️ PERFIL: Foco em produção`}

📝 DESCRIÇÃO DA DEMANDA:
${opening.description}

COMO SE CANDIDATAR:
Acesse a aba "Projetos & Vagas" -> "Vagas Abertas" no portal da LAJE e clique em "Tenho Interesse" para entrar em contato com a liderança do projeto:
https://ais-pre-qbm74e6dhvznyugdy4uwmp-220243259932.us-west2.run.app

Não perca essa oportunidade de somar créditos e experiência prática no seu portfólio!

— Diretoria de Recursos Humanos & Projetos da LAJE`;

  return {
    bcc: memberEmails,
    subject,
    body,
    category: 'opening',
    title: `Vaga: ${opening.role} (${opening.projectName})`
  };
};

/**
 * 5. E-mail de Nova Microtarefa no Mural
 */
export const buildTaskEmail = (
  task: {
    title: string;
    projectName: string;
    area: string;
    deliverySpecs: string;
    size?: string;
    deadline?: string;
    helper?: string;
  },
  memberEmails: string[]
): EmailPayload => {
  const areaUpper = (task.area || 'Geral').toUpperCase();
  const subject = `[LAJE] Nova Microtarefa no Mural: ${task.title} [${areaUpper}] 📋`;

  let deadlineStr = 'Sem prazo rígido';
  if (task.deadline) {
    try {
      deadlineStr = new Date(task.deadline).toLocaleDateString('pt-BR');
    } catch {
      deadlineStr = task.deadline;
    }
  }

  const body = 
`Olá, membros da LAJE!

Uma nova microtarefa pontual foi adicionada ao "Mural de Tarefas":

📋 TAREFA: ${task.title}
🎮 PROJETO: ${task.projectName}
🏷️ ÁREA: ${task.area}
📦 TAMANHO: ${task.size || 'Pequena'}
📅 PRAZO SUGERIDO: ${deadlineStr}
${task.helper ? `👤 RESPONSÁVEL / TIRA-DÚVIDAS: ${task.helper}\n` : ''}
📌 ESPECIFICAÇÃO DE ENTREGA:
${task.deliverySpecs}

COMO PEGAR ESTA TAREFA:
No mural de tarefas pequenas e pontuais, você pode pegar uma tarefa sem precisar entrar em um time fixo.
Entregue, receba retorno em até 3 dias e ganhe seu nome nos créditos do jogo!

Acesse o portal e clique em "Pegar Esta Tarefa":
https://ais-pre-qbm74e6dhvznyugdy4uwmp-220243259932.us-west2.run.app

— Diretoria de Projetos & RH da LAJE`;

  return {
    bcc: memberEmails,
    subject,
    body,
    category: 'task',
    title: `Microtarefa: ${task.title}`
  };
};
