import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DetailedMemberData {
  id?: string;
  name?: string;
  email?: string;
  discordUser?: string;
  birthday?: string;
  course?: string;
  period?: string;
  collegeFocus?: number | string;
  leagueRole?: string;
  leagueFocus?: number | string;
  weeklyHours?: string;
  roleFocus?: string;
  learningFocus?: string;
  isInProject?: string;
  currentProjects?: string;
  projectDetails?: Record<string, string>;
  notInProjectStatus?: string;
  interestedProjects?: string;
  attendancePreference?: string;
  microtasksInterest?: string;
  priority?: string;
  progress?: number | string;
  deadline?: string;
  projectDeadlines?: Record<string, string>;
  status?: string;
  deletionReason?: string;
  createdAt?: string;
  lastEditedAt?: string;
  editRequestStatus?: string;
  editAuthorized?: boolean;
  editHistory?: Array<{ action?: string; timestamp?: string; reason?: string; note?: string }>;
}

/**
 * Formats date from YYYY-MM-DD or ISO string to PT-BR DD/MM/YYYY
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Não informado';
  try {
    if (dateStr.includes('-') && dateStr.length === 10) {
      const [y, m, d] = dateStr.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Formats datetime with hours and minutes
 */
function formatDateTime(dateStr?: string): string {
  if (!dateStr) return 'Não informado';
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleString('pt-BR');
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Generates and downloads a complete, detailed PDF dossier for a member's form response.
 */
export function exportDetailedMemberPDF(member: DetailedMemberData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const memberName = (member.name || 'Membro').trim();
  const isExMember = member.status === 'Ex-membro';
  const primaryEmerald: [number, number, number] = [16, 185, 129];
  const darkSlate: [number, number, number] = [18, 18, 22];
  const sectionHeaderBg: [number, number, number] = [30, 41, 59]; // slate-800
  const lightGreyBg: [number, number, number] = [248, 250, 252];

  // Top Accent Bar
  doc.setFillColor(...primaryEmerald);
  doc.rect(0, 0, 210, 4, 'F');

  // Header Banner Background
  doc.setFillColor(...darkSlate);
  doc.rect(0, 4, 210, 28, 'F');

  // Brand and Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('LAJE GAME LAB  |  SISTEMA DE RH', 14, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(167, 243, 208); // emerald-200
  doc.text('FICHA CADASTRAL COMPLETA - RESPOSTA DO FORMULÁRIO', 14, 22);

  // Status Badge on Header Right
  const statusText = isExMember ? 'STATUS: EX-MEMBRO' : 'STATUS: ATIVO';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  if (isExMember) {
    doc.setFillColor(239, 68, 68); // red-500
  } else {
    doc.setFillColor(...primaryEmerald);
  }
  doc.roundedRect(145, 12, 51, 8, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(statusText, 170.5, 17.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 145, 26);

  // Member Quick Summary Subheader
  let currentY = 38;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(memberName, 14, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const contactLine = [
    `E-mail: ${member.email || 'Não informado'}`,
    `Discord: ${member.discordUser ? `${member.discordUser}` : 'Não informado'}`,
    `Área: ${member.leagueRole || 'Não informado'}`
  ].join('   |   ');
  doc.text(contactLine, 14, currentY);

  currentY += 6;

  // Build Structured Table Sections using autoTable
  const tableRows: Array<{ section: boolean; label: string; value: string; extra?: string }> = [
    // SEÇÃO 1
    { section: true, label: '1. DADOS DE IDENTIFICAÇÃO E CONTATO', value: '' },
    { section: false, label: 'Nome Completo', value: member.name || 'Não informado' },
    { section: false, label: 'E-mail Principal', value: member.email || 'Não informado' },
    { section: false, label: 'Usuário do Discord', value: member.discordUser ? `${member.discordUser}` : 'Não informado' },
    { section: false, label: 'Data de Aniversário', value: formatDate(member.birthday) },
    { section: false, label: 'Situação / Status', value: member.status || 'Ativo' },
  ];

  if (isExMember && member.deletionReason) {
    tableRows.push({
      section: false,
      label: 'Motivo do Desligamento',
      value: member.deletionReason
    });
  }

  // SEÇÃO 2
  tableRows.push(
    { section: true, label: '2. DADOS ACADÊMICOS (UNIVERSIDADE)', value: '' },
    { section: false, label: 'Curso de Graduação', value: member.course || 'Não informado' },
    { section: false, label: 'Período Atual', value: member.period || 'Não informado' }
  );

  // SEÇÃO 3
  tableRows.push(
    { section: true, label: '3. ATUAÇÃO E ENGAJAMENTO NA LAJE', value: '' },
    { section: false, label: 'Função Atual / Área(s)', value: member.leagueRole || 'Não informado' },
    { section: false, label: 'Dedicação Semanal Declarada', value: member.weeklyHours || 'Não informado' },
    { section: false, label: 'Foco na Função Atual', value: member.roleFocus || 'Não informado' },
    { section: false, label: 'Foco de Aprendizado / Desenvolvimento', value: member.learningFocus || 'Nenhum foco específico relatado' }
  );

  // SEÇÃO 4
  tableRows.push(
    { section: true, label: '4. ALOCAÇÃO EM PROJETOS', value: '' },
    { section: false, label: 'Alocado em Projeto?', value: member.isInProject || (member.currentProjects ? 'Sim' : 'Não') },
    { section: false, label: 'Projetos Atuais em Andamento', value: member.currentProjects || 'Nenhum projeto atual informado' },
    ...Object.entries(member.projectDetails || {}).map(([project, details]) => ({
      section: false,
      label: `Atuação em ${project}`,
      value: details || 'Não informado'
    }))
  );

  if (member.notInProjectStatus) {
    tableRows.push({
      section: false,
      label: 'Situação em Relação a Projetos',
      value: member.notInProjectStatus
    });
  }

  tableRows.push({
    section: false,
    label: 'Projetos de Interesse',
    value: member.interestedProjects || 'Nenhum projeto de interesse informado'
  });

  const projectDeadlineEntries = Object.entries(member.projectDeadlines || {});

  // SEÇÃO 5
  tableRows.push(
    { section: true, label: '5. METAS, PRAZOS E DISPONIBILIDADE', value: '' },
    ...(projectDeadlineEntries.length > 0
      ? projectDeadlineEntries.map(([project, deadline]) => ({
          section: false,
          label: `Prazo: ${project}`,
          value: formatDate(deadline)
        }))
      : [{ section: false, label: 'Data Limite / Meta (Deadline)', value: formatDate(member.deadline) }]),
    { section: false, label: 'Prioridade Registrada', value: member.priority || 'Média' },
    { section: false, label: 'Disponibilidade para Reuniões', value: member.attendancePreference || 'Sim, sem problema' },
    { section: false, label: 'Interesse em Microtarefas', value: member.microtasksInterest || 'Sim, me avisem quando abrir' }
  );

  // SEÇÃO 6
  tableRows.push(
    { section: true, label: '6. HISTÓRICO E METADADOS DO FORMULÁRIO', value: '' },
    { section: false, label: 'Data de Envio Inicial', value: formatDateTime(member.createdAt) },
    { section: false, label: 'Última Alteração Registrada', value: formatDateTime(member.lastEditedAt) },
    { section: false, label: 'Permissão de Edição (RH)', value: member.editAuthorized ? 'Autorizado para edição' : 'Bloqueado (Somente Leitura)' }
  );

  if (member.editRequestStatus) {
    const statusMap: Record<string, string> = {
      pending: 'Pendente de Análise pelo RH',
      approved: 'Aprovada pelo RH',
      rejected: 'Recusada pelo RH'
    };
    tableRows.push({
      section: false,
      label: 'Status da Solicitação de Edição',
      value: statusMap[member.editRequestStatus] || member.editRequestStatus
    });
  }

  if (member.editHistory && member.editHistory.length > 0) {
    const historyText = member.editHistory
      .map(h => `• ${h.action || 'Ação'} em ${formatDateTime(h.timestamp)}${h.reason ? ` (${h.reason})` : ''}`)
      .join('\n');
    tableRows.push({
      section: false,
      label: 'Histórico de Solicitações',
      value: historyText
    });
  }

  // Generate Table
  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14, bottom: 20 },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
      lineColor: [226, 232, 240], // slate-200
      lineWidth: 0.2,
      overflow: 'linebreak'
    },
    columnStyles: {
      0: { cellWidth: 60, fontStyle: 'bold', textColor: [51, 65, 85] }, // slate-700
      1: { cellWidth: 122, textColor: [15, 23, 42] } // slate-900
    },
    body: tableRows.map(row => {
      if (row.section) {
        return [
          {
            content: row.label,
            colSpan: 2,
            styles: {
              fillColor: sectionHeaderBg,
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 9,
              cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 }
            }
          },
          ''
        ];
      }
      return [
        {
          content: row.label,
          styles: { fillColor: lightGreyBg }
        },
        {
          content: row.value
        }
      ];
    }),
    didDrawPage: (data) => {
      // Header for subsequent pages if any
      if (data.pageNumber > 1) {
        doc.setFillColor(...darkSlate);
        doc.rect(0, 0, 210, 14, 'F');
        doc.setFillColor(...primaryEmerald);
        doc.rect(0, 0, 210, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(`LAJE GAME LAB | FICHA DO MEMBRO: ${memberName.toUpperCase()}`, 14, 9);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(156, 163, 175);
        doc.text(statusText, 196, 9, { align: 'right' });
      }
    }
  });

  // Footer on all pages
  const totalPages = typeof doc.getNumberOfPages === 'function' ? doc.getNumberOfPages() : (doc.internal.pages.length - 1);
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Footer line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, 287, 196, 287);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('LAJE HR System  •  Documento Confidencial para Administração Interna', 14, 292);
    doc.text(`Página ${i} de ${totalPages}`, 196, 292, { align: 'right' });
  }

  // Filename safe
  const sanitizedName = memberName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dateStamp = new Date().toISOString().split('T')[0];
  doc.save(`laje_ficha_${sanitizedName}_${dateStamp}.pdf`);
}
