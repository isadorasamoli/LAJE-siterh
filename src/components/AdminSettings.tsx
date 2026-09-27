import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { Shield, Trash2, Plus, UserPlus } from 'lucide-react';

interface AdminUser {
  id: string;
  email: string;
  addedAt: string;
}

export default function AdminSettings() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');

  const hardcodedAdmins = ['isadora.mlima@ufpe.br'];

  const fetchAdmins = async () => {
    try {
      const q = query(collection(db, 'admins'));
      const querySnapshot = await getDocs(q);
      const adminList: AdminUser[] = [];
      querySnapshot.forEach((doc) => {
        adminList.push({ id: doc.id, ...doc.data() } as AdminUser);
      });
      setAdmins(adminList);
    } catch (err) {
      console.error("Failed to fetch admins", err);
      toast.error('Erro ao carregar lista de administradores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error('Por favor, insira um e-mail válido');
      return;
    }

    const email = newEmail.toLowerCase().trim();

    if (hardcodedAdmins.includes(email) || admins.some(a => a.email === email)) {
      toast.error('Este e-mail já tem permissões de Administrador');
      return;
    }

    try {
      // Usando o e-mail como ID do documento para evitar duplicidades
      await setDoc(doc(db, 'admins', email), {
        email: email,
        addedAt: new Date().toISOString()
      });
      toast.success('Administrador adicionado com sucesso!');
      setNewEmail('');
      fetchAdmins();
    } catch (err) {
      console.error('Erro ao adicionar administrador:', err);
      toast.error('Erro ao adicionar administrador');
    }
  };

  const handleRemoveAdmin = async (id: string, email: string) => {
    try {
      await deleteDoc(doc(db, 'admins', id));
      toast.success('Administrador removido com sucesso!');
      fetchAdmins();
    } catch (err) {
      console.error(err);
      toast.error('Erro: ' + (err.message || 'desconhecido'));
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-['Syne'] font-bold text-[var(--color-ink)] mb-2">Permissões de Acesso</h2>
          <p className="text-[var(--color-ink-muted)] text-sm">Gerencie quem tem acesso ao Dashboard de RH e Calendário Geral.</p>
        </div>
      </div>

      <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]  p-6">
        <h3 className="text-[1.1rem] font-bold mb-4 flex items-center gap-2">
          <UserPlus size={18} />
          Adicionar Novo Administrador
        </h3>
        <form onSubmit={handleAddAdmin} className="flex gap-4">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Digite o e-mail do novo membro do RH..."
            className="flex-1 bg-[rgba(0,0,0,0.2)] border border-[var(--color-ink-faint)] p-3  text-[var(--color-ink)] focus:border-[var(--color-ink-muted)] outline-none"
          />
          <button 
            type="submit"
            className="bg-[var(--color-ink)] text-[var(--color-bg-dark)] px-6 py-3  font-bold flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus size={18} />
            Conceder Acesso
          </button>
        </form>
      </div>

      <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]  overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.01)] text-[0.8rem] uppercase tracking-wider text-[var(--color-ink-muted)]">
              <th className="p-4 font-medium">E-mail</th>
              <th className="p-4 font-medium">Tipo de Acesso</th>
              <th className="p-4 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {hardcodedAdmins.map((email) => (
              <tr key={email} className="border-b border-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                <td className="p-4 font-medium flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-[var(--color-bg-dark)] font-bold">
                    {email[0].toUpperCase()}
                  </div>
                  {email}
                </td>
                <td className="p-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(16,185,129,0.1)] text-[#10b981] text-[0.7rem] font-bold uppercase tracking-wider border border-[rgba(16,185,129,0.2)]">
                    <Shield size={12} /> Super Admin
                  </span>
                </td>
                <td className="p-4 text-right text-[var(--color-ink-muted)] text-sm">
                  Padrão do Sistema
                </td>
              </tr>
            ))}
            
            {loading ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-[var(--color-ink-muted)]">Carregando...</td>
              </tr>
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-[var(--color-ink-muted)] border-t border-[var(--color-ink-faint)]">
                  Nenhum administrador adicional cadastrado.
                </td>
              </tr>
            ) : (
              admins.map((admin) => (
                <tr key={admin.id} className="border-b border-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.02)] transition-colors last:border-0">
                  <td className="p-4 font-medium flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-ink-faint)] flex items-center justify-center text-[var(--color-ink)] font-bold">
                      {admin.email[0].toUpperCase()}
                    </div>
                    {admin.email}
                  </td>
                  <td className="p-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-ink-faint)] text-[var(--color-ink)] text-[0.7rem] font-bold uppercase tracking-wider">
                      Membro RH
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => handleRemoveAdmin(admin.id, admin.email)}
                      className="p-2 text-[var(--color-ink-muted)] hover:text-[#ef4444] hover:bg-[rgba(239,68,68,0.1)]  transition-colors"
                      title="Remover Acesso"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
