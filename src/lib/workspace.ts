export const fetchUpcomingEvents = async (accessToken: string) => {
  try {
    const timeMin = new Date().toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=3&orderBy=startTime&singleEvents=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error('Failed to fetch calendar events');
    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error('Error fetching calendar events', error);
    return [];
  }
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const formatEventHtml = (event: any, includeCalendarLink = true) => {
  const startDate = new Date(event.date);
  const endDate = new Date(event.date);
  const durationMatch = String(event.duration || '').match(/(\d+)/);
  const durationHours = durationMatch ? parseInt(durationMatch[1], 10) : 1;
  endDate.setHours(endDate.getHours() + durationHours);
  const formatForGcal = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
  const gcalLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&details=${encodeURIComponent(event.description)}&dates=${formatForGcal(startDate)}/${formatForGcal(endDate)}`;

  return `<li style="margin-bottom: 10px;">
    <strong>${escapeHtml(event.title || 'Evento')}</strong>: ${startDate.toLocaleString('pt-BR')} (${escapeHtml(event.duration || '1 hora')})<br/>
    <span style="color: #aaa; font-size: 12px;">${escapeHtml(event.description || '')}</span>
    ${includeCalendarLink ? `<br/><a href="${gcalLink}" target="_blank" style="display: inline-block; margin-top: 4px; padding: 4px 8px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 4px; font-size: 12px;">Adicionar ao Google Agenda</a>` : ''}
  </li>`;
};

const sendGmailMessage = async (accessToken: string, headers: string[], html: string) => {
  if (!accessToken) {
    throw new Error('Access token not provided');
  }
  const emailContent = [
    'Content-Type: text/html; charset="UTF-8"\n',
    'MIME-Version: 1.0\n',
    ...headers.map(header => `${header}\n`),
    `\n${html}`
  ].join('');
  const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailContent)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: base64EncodedEmail })
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gmail API error (${response.status}): ${errorBody}`);
  }
};

export const createProjectMailtoLink = (
  emails: string[],
  project: {
    name: string;
    genre: string;
    engine: string;
    leader: string;
    description: string;
    coverEmoji?: string;
    semester?: string;
  }
) => {
  const bcc = emails.filter(e => e && e.includes('@')).join(',');
  const emoji = project.coverEmoji || '🎮';
  const subject = encodeURIComponent(`[LAJE] Novo Projeto Cadastrado: ${project.name} ${emoji}`);
  const body = encodeURIComponent(
    `Olá membros da LAJE!\n\n` +
    `Um novo projeto foi adicionado ao mural de Projetos & Vagas:\n\n` +
    `🎮 Projeto: ${project.name}\n` +
    `🕹️ Gênero: ${project.genre}\n` +
    `⚙️ Engine: ${project.engine}\n` +
    `👤 Líder: ${project.leader}\n` +
    `📅 Semestre: ${project.semester || '2026.2'}\n\n` +
    `Descrição:\n${project.description}\n\n` +
    `Acesse o portal da LAJE para ver a ficha completa, candidatar-se às vagas abertas ou pegar microtarefas!\n\n` +
    `— Liga Acadêmica de Jogos Eletrônicos (LAJE)`
  );
  return `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${subject}&body=${body}`;
};

export const sendWelcomeEmail = async (accessToken: string, toEmail: string, name: string, events: any[]) => {
  if (!accessToken || !toEmail) return false;
  try {
    const eventsHtml = events.length > 0 
      ? `<ul>${events.map(event => formatEventHtml(event)).join('')}</ul>`
      : '<p>Nenhum evento futuro agendado no momento.</p>';

    const emailHtml = `<div style="font-family: sans-serif; color: #e5e7eb; background-color: #030712; padding: 24px; border: 1px solid #1f2937; border-radius: 8px;">
        <h1 style="color: #10b981;">Bem-vindo(a), ${escapeHtml(name)}!</h1>
        <p>Você realizou seu primeiro login no portal. Aqui estão os próximos eventos agendados:</p>
        ${eventsHtml}
        <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">Este é um e-mail automático do sistema LAJE HR.</p>
      </div>`;

    await sendGmailMessage(accessToken, [`To: ${toEmail}`, 'Subject: Bem-vindo ao Calendário da LAJE!'], emailHtml);
    return true;
  } catch (error) {
    console.info('Welcome email could not be sent directly via Gmail:', error);
    return false;
  }
};

export const sendEventNotification = async (
  accessToken: string,
  emails: string[],
  event: any,
  type: 'create' | 'update' | 'delete'
) => {
  if (!accessToken || !emails.length) return false;
  const isDelete = type === 'delete';
  const subject = type === 'create' ? 'Novo Evento' : type === 'update' ? 'Atualização de Evento' : 'Evento Cancelado';
  const heading = type === 'create' ? 'Novo evento cadastrado' : type === 'update' ? 'Evento atualizado' : 'Evento cancelado';
  const message = type === 'create'
    ? 'Um novo evento foi adicionado ao calendário da LAJE:'
    : type === 'update'
      ? 'As informações deste evento foram alteradas:'
      : 'Este evento foi excluído e não acontecerá mais:';

  const html = `<div style="font-family: sans-serif; color: #e5e7eb; background-color: #030712; padding: 24px; border: 1px solid #1f2937; border-radius: 8px;">
    <h1 style="color: ${isDelete ? '#ef4444' : '#10b981'};">${heading}</h1>
    <p>${message}</p>
    <ul>${formatEventHtml(event, !isDelete)}</ul>
    <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">E-mail automático do sistema LAJE HR.</p>
  </div>`;

  try {
    await sendGmailMessage(accessToken, [`Bcc: ${emails.join(',')}`, `Subject: ${subject}: ${event.title}`], html);
    return true;
  } catch (err) {
    console.info('Event notification email could not be sent via Gmail:', err);
    return false;
  }
};

export const sendNewProjectNotification = async (
  accessToken: string,
  emails: string[],
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
  }
): Promise<{ success: boolean; sentCount: number }> => {
  if (!accessToken || !emails.length) return { success: false, sentCount: 0 };

  const uniqueEmails = Array.from(new Set(
    emails
      .map(e => e.trim().toLowerCase())
      .filter(e => e && e.includes('@'))
  ));

  if (!uniqueEmails.length) return { success: false, sentCount: 0 };

  const emoji = project.coverEmoji || '🎮';
  const subject = `Novo Projeto na LAJE: ${project.name} ${emoji}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e5e7eb; background-color: #0b0f19; padding: 32px 24px; border: 1px solid #1f2937; border-radius: 8px; max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 40px; display: inline-block; margin-bottom: 8px;">${emoji}</span>
        <h1 style="color: #10b981; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.02em;">Novo Projeto Adicionado!</h1>
        <p style="color: #9ca3af; font-size: 13px; margin-top: 6px; text-transform: uppercase; font-family: monospace;">Liga Acadêmica de Jogos Eletrônicos • LAJE</p>
      </div>

      <div style="background-color: #111827; border: 1px solid #374151; border-radius: 6px; padding: 20px; margin-bottom: 20px;">
        <h2 style="color: #ffffff; margin-top: 0; margin-bottom: 8px; font-size: 20px;">${escapeHtml(project.name)}</h2>
        <div style="display: flex; gap: 8px; margin-bottom: 14px; font-size: 12px; color: #f59e0b; font-family: monospace;">
          <span>${escapeHtml(project.genre)}</span> • <span>${escapeHtml(project.engine)}</span> • <span>Semestre ${escapeHtml(project.semester || '2026.2')}</span>
        </div>
        <p style="color: #d1d5db; line-height: 1.6; font-size: 14px; margin: 0 0 16px 0;">
          ${escapeHtml(project.elevatorPitch || project.description)}
        </p>

        ${project.diferencial ? `
          <div style="border-left: 3px solid #f59e0b; padding-left: 12px; margin-bottom: 14px;">
            <strong style="color: #f59e0b; font-size: 12px; text-transform: uppercase;">Diferencial:</strong>
            <p style="color: #9ca3af; font-size: 13px; margin: 2px 0 0 0;">${escapeHtml(project.diferencial)}</p>
          </div>
        ` : ''}

        <div style="border-top: 1px solid #1f2937; padding-top: 12px; font-size: 13px; color: #9ca3af;">
          <p style="margin: 4px 0;"><strong>Líder do Projeto:</strong> <span style="color: #e5e7eb;">${escapeHtml(project.leader)}</span> ${project.leaderDiscord ? `(${escapeHtml(project.leaderDiscord)})` : ''}</p>
          ${project.targetScope ? `<p style="margin: 4px 0;"><strong>Escopo Alvo:</strong> ${escapeHtml(project.targetScope)}</p>` : ''}
        </div>
      </div>

      <p style="font-size: 13px; color: #d1d5db; line-height: 1.5; margin-bottom: 24px;">
        Acesse o portal da LAJE na aba <strong>Projetos & Vagas</strong> para ver a ficha completa do jogo, candidatar-se às vagas abertas ou pegar microtarefas pontuais no mural!
      </p>

      <div style="border-top: 1px solid #1f2937; padding-top: 16px; text-align: center; color: #6b7280; font-size: 11px;">
        <p style="margin: 0;">Você recebeu esta notificação automática porque é membro cadastrado na LAJE.</p>
      </div>
    </div>
  `;

  let sent = 0;
  const BATCH_SIZE = 40;
  for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
    const batch = uniqueEmails.slice(i, i + BATCH_SIZE);
    try {
      await sendGmailMessage(
        accessToken,
        [`Bcc: ${batch.join(',')}`, `Subject: ${subject}`],
        html
      );
      sent += batch.length;
    } catch (err) {
      console.info('Envio por Gmail API não autorizado para a conta atual:', err);
    }
  }
  return { success: sent > 0, sentCount: sent };
};

