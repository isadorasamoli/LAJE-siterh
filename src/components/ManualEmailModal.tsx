import React, { useState } from 'react';
import { X, ExternalLink, Mail, Copy, Check, Send, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { EmailPayload, openManualEmailInBrowser } from '../lib/manualEmail';

interface ManualEmailModalProps {
  email: EmailPayload | null;
  onClose: () => void;
}

export default function ManualEmailModal({ email, onClose }: ManualEmailModalProps) {
  if (!email) return null;

  const [copiedBody, setCopiedBody] = useState(false);
  const [copiedEmails, setCopiedEmails] = useState(false);

  const bccList = email.bcc || [];
  const bccCount = bccList.length;

  const handleOpenAgain = () => {
    openManualEmailInBrowser(email);
    toast.success('Nova aba do navegador aberta para envio do e-mail!');
  };

  const handleCopyBody = () => {
    try {
      navigator.clipboard.writeText(email.body);
      setCopiedBody(true);
      toast.success('Texto da mensagem copiado para a área de transferência!');
      setTimeout(() => setCopiedBody(false), 2500);
    } catch {
      toast.error('Erro ao copiar texto');
    }
  };

  const handleCopyEmails = () => {
    try {
      const listStr = email.to || bccList.join(', ');
      navigator.clipboard.writeText(listStr);
      setCopiedEmails(true);
      toast.success('Lista de e-mails copiada com sucesso!');
      setTimeout(() => setCopiedEmails(false), 2500);
    } catch {
      toast.error('Erro ao copiar e-mails');
    }
  };

  // Montar URLs
  const toParam = email.to || '';
  const bccParam = bccList.join(',');
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1` +
    (toParam ? `&to=${encodeURIComponent(toParam)}` : '') +
    (bccParam ? `&bcc=${encodeURIComponent(bccParam)}` : '') +
    `&su=${encodeURIComponent(email.subject)}` +
    `&body=${encodeURIComponent(email.body)}`;

  let mailtoUrl = `mailto:${encodeURIComponent(toParam)}?`;
  const mailtoParts: string[] = [];
  if (bccParam) mailtoParts.push(`bcc=${encodeURIComponent(bccParam)}`);
  mailtoParts.push(`subject=${encodeURIComponent(email.subject)}`);
  mailtoParts.push(`body=${encodeURIComponent(email.body)}`);
  mailtoUrl += mailtoParts.join('&');

  const getCategoryBadge = () => {
    switch (email.category) {
      case 'welcome':
        return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold font-['Space_Mono'] uppercase">Boas-Vindas</span>;
      case 'event':
        return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold font-['Space_Mono'] uppercase">Evento do Calendário</span>;
      case 'project':
        return <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 text-[10px] font-bold font-['Space_Mono'] uppercase">Novo Projeto</span>;
      case 'opening':
        return <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold font-['Space_Mono'] uppercase">Vaga Aberta</span>;
      case 'task':
        return <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold font-['Space_Mono'] uppercase">Mural de Tarefas</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-[#141416] border border-gray-700 max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl space-y-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
              <Mail size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white font-['Syne']">
                  Envio Manual de E-mail
                </h3>
                {getCategoryBadge()}
              </div>
              <p className="text-xs text-emerald-400 font-['Space_Mono'] mt-0.5 flex items-center gap-1">
                <Sparkles size={12} />
                Aba aberta no navegador com o modelo pronto para disparo!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Informações de Envio */}
        <div className="space-y-3 text-xs font-['Space_Mono']">
          <div className="p-3 bg-gray-900 border border-gray-800 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-400 font-semibold uppercase">Destinatários:</span>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 font-bold">
                  {email.to ? `Direto: ${email.to}` : `BCC (Cópia Oculta): ${bccCount} membros`}
                </span>
                <button
                  type="button"
                  onClick={handleCopyEmails}
                  className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] flex items-center gap-1 border border-gray-700 cursor-pointer"
                  title="Copiar lista de e-mails"
                >
                  {copiedEmails ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  {copiedEmails ? 'Copiado!' : 'Copiar E-mails'}
                </button>
              </div>
            </div>

            <div>
              <span className="text-gray-400 font-semibold uppercase block mb-1">Assunto:</span>
              <p className="text-white font-bold bg-[#161619] p-2 border border-gray-800">
                {email.subject}
              </p>
            </div>
          </div>

          {/* Pré-visualização da Mensagem */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400 uppercase font-semibold">Corpo da Mensagem (Preenchido Automaticamente):</span>
              <button
                type="button"
                onClick={handleCopyBody}
                className="px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] flex items-center gap-1 border border-gray-700 cursor-pointer"
              >
                {copiedBody ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                {copiedBody ? 'Texto Copiado!' : 'Copiar Texto'}
              </button>
            </div>
            <textarea
              readOnly
              rows={8}
              value={email.body}
              className="w-full bg-[#161619] border border-gray-700 p-3 text-xs text-gray-200 font-['Space_Mono'] outline-none resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Ações de Envio em Nova Aba */}
        <div className="pt-3 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold text-xs font-['Space_Mono'] transition-all shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <ExternalLink size={13} />
              Abrir no Gmail Web (Nova Aba)
            </a>

            <a
              href={mailtoUrl}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-['Space_Mono'] border border-gray-700 cursor-pointer transition-colors"
              title="Abrir no cliente de e-mail padrão do sistema (Outlook, Apple Mail, etc.)"
            >
              <Mail size={13} />
              Cliente de E-mail (Mailto)
            </a>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-['Space_Mono'] font-bold cursor-pointer transition-colors"
          >
            Concluir & Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
