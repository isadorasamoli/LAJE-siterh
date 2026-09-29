import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { auth } from '../lib/firebase';

interface AdminAccessBlockedProps {
  title?: string;
  onNavigateHome?: () => void;
}

export default function AdminAccessBlocked({ 
  title = 'Acesso Administrativo Restrito', 
  onNavigateHome 
}: AdminAccessBlockedProps) {
  const currentUser = auth.currentUser;
  const userEmail = currentUser?.email || 'Usuário não autenticado';

  return (
    <div className="w-full max-w-2xl mx-auto my-12 p-8 border border-red-500/30 bg-gradient-to-b from-red-950/20 via-[#121216] to-[#0c0c0e] shadow-2xl relative overflow-hidden">
      {/* Decorative warning accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

      <div className="flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-inner">
            <ShieldAlert size={36} className="text-red-500 animate-pulse" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-red-600 text-white rounded-full p-1 border-2 border-[#121216]">
            <Lock size={12} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/10 border border-red-500/20 text-red-400 font-['Space_Mono'] text-[11px] uppercase tracking-wider">
            <span>HTTP 403: Acesso Proibido</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-['Syne'] text-white uppercase tracking-tight">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
            Esta área é de uso exclusivo dos administradores autorizados do sistema LAJE. O acesso direto via URL, rotas ou renderização condicional não autorizada é terminantemente bloqueado.
          </p>
        </div>

        <div className="w-full bg-[#18181f] border border-white/5 p-4 text-left font-['Space_Mono'] text-xs space-y-2 rounded-sm">
          <div className="flex items-center justify-between text-[11px] text-gray-400 border-b border-white/5 pb-2">
            <span>Identificador do Usuário:</span>
            <span className="text-gray-200 font-bold truncate max-w-[240px]">{userEmail}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400 border-b border-white/5 pb-2">
            <span>Privilégio Verificado:</span>
            <span className="text-amber-400 font-bold">Membro (Não-Administrador)</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-400">
            <span>Status de Autorização:</span>
            <span className="text-red-400 font-bold uppercase tracking-wider">Bloqueado</span>
          </div>
        </div>

        {onNavigateHome && (
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/40 text-red-200 font-semibold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer hover:shadow-lg hover:shadow-red-950/50"
          >
            <ArrowLeft size={16} />
            Voltar para o Formulário Seguro
          </button>
        )}
      </div>
    </div>
  );
}
