import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from './lib/firebase';
import { sendWelcomeEmail } from './lib/workspace';
import { initAuth, googleSignIn, logout, getAccessToken } from './lib/auth';
import { Terminal, LayoutDashboard, LogOut, Calendar as CalendarIcon, Moon, Sun, Settings, History, Gamepad2 } from 'lucide-react';
import Form from './components/Form';
import Dashboard from './components/Dashboard';
import CalendarTab from './components/CalendarTab';
import AdminSettings from './components/AdminSettings';
import AuditLogs from './components/AuditLogs';
import ProjectsHub from './components/ProjectsHub';
import AdminAccessBlocked from './components/AdminAccessBlocked';
import { toast } from 'react-hot-toast';

export type TabType = 'form' | 'projects' | 'dashboard' | 'calendar' | 'logs' | 'settings';
export const ADMIN_TABS: TabType[] = ['dashboard', 'logs', 'settings'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('form');
  const [isAdmin, setIsAdmin] = useState(false);
  const [userLeagueRole, setUserLeagueRole] = useState<string>('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const getTabFromUrl = (): TabType | null => {
    try {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase().trim();
      const validTabs: TabType[] = ['form', 'projects', 'dashboard', 'calendar', 'logs', 'settings'];
      if (validTabs.includes(hash as TabType)) {
        return hash as TabType;
      }
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab')?.toLowerCase().trim();
      if (tabParam && validTabs.includes(tabParam as TabType)) {
        return tabParam as TabType;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const sanitizeAndSetUrl = (tab: TabType) => {
    try {
      const cleanUrl = `${window.location.pathname}${tab !== 'form' ? `#${tab}` : ''}`;
      window.history.replaceState(null, '', cleanUrl);
    } catch {
      // ignore
    }
  };

  const handleTabChange = (targetTab: TabType) => {
    if (ADMIN_TABS.includes(targetTab)) {
      if (!isAdmin) {
        toast.error('Acesso restrito: Privilégios de administrador necessários.');
        setActiveTab('form');
        sanitizeAndSetUrl('form');
        return;
      }
    }
    setActiveTab(targetTab);
    sanitizeAndSetUrl(targetTab);
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    const checkUserRoleAndTheme = async (currentUser: User) => {
      try {
        let adminStatus = false;
        const userEmail = currentUser.email?.toLowerCase().trim() || '';
        if (userEmail === 'isadora.mlima@ufpe.br' || userEmail === 'isadora.mlima@ufpe' || userEmail.startsWith('isadora.mlima@ufpe')) {
          adminStatus = true;
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', userEmail));
          adminStatus = adminDoc.exists() && adminDoc.data().email?.toLowerCase().trim() === userEmail;
        }
        setIsAdmin(adminStatus);

        let role = '';
        const respQ = query(collection(db, 'responses'), where('userId', '==', currentUser.uid));
        const respSnap = await getDocs(respQ);
        if (!respSnap.empty) {
          role = respSnap.docs[0].data().leagueRole || '';
        } else if (currentUser.email) {
          const emailQ = query(collection(db, 'responses'), where('email', '==', currentUser.email));
          const emailSnap = await getDocs(emailQ);
          if (!emailSnap.empty) {
            role = emailSnap.docs[0].data().leagueRole || '';
          }
        }
        setUserLeagueRole(role);
        const isRH = role.toLowerCase().includes('rh') || role.toLowerCase().includes('recursos humanos') || userEmail === 'isadora.mlima@ufpe.br' || userEmail.startsWith('isadora.mlima@ufpe');

        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        const currentData = userSnap.exists() ? userSnap.data() : {};
        if (currentData.theme) {
          setTheme(currentData.theme);
        }
        await setDoc(userRef, {
          ...currentData,
          isRH,
          leagueRole: role,
          theme: currentData.theme || 'dark'
        }, { merge: true });
      } catch (err) {
        console.error("Failed to fetch user roles", err);
      }
    };

    const checkAndSendEmails = async (currentUser: User, currentToken: string) => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        const q = query(collection(db, 'events'), where('date', '>=', new Date().toISOString()), orderBy('date', 'asc'));
        const querySnapshot = await getDocs(q);
        const futureEvents = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

        const userData = userSnap.exists() ? userSnap.data() : {};
        if (userData.hasReceivedWelcomeEmail !== true) {
          if (currentToken) {
            try {
              await sendWelcomeEmail(currentToken, currentUser.email || '', currentUser.displayName || 'Membro', futureEvents);
            } catch (e) {
              console.info("Boas-vindas por e-mail direto suprimido:", e);
            }
          }
          await setDoc(userRef, {
            ...userData,
            hasReceivedWelcomeEmail: true,
            lastEmailSentAt: Date.now(),
            theme: userData.theme || 'dark'
          }, { merge: true });
        }
      } catch (error) {
        console.error("Error processing emails:", error);
      }
    };

    const unsubscribe = initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
        setNeedsAuth(false);
        if (u) {
          checkUserRoleAndTheme(u);
          checkAndSendEmails(u, t);
        }
      },
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, []);

  // Monitoramento estrito de rotas e proteção de URL contra acessos não autorizados
  useEffect(() => {
    const syncRouteWithPermissions = () => {
      const urlTab = getTabFromUrl();
      if (urlTab) {
        if (ADMIN_TABS.includes(urlTab)) {
          if (!isAdmin) {
            toast.error('Acesso restrito: Privilégios de administrador necessários.');
            setActiveTab('form');
            sanitizeAndSetUrl('form');
            return;
          }
        }
        setActiveTab(urlTab);
      } else {
        if (ADMIN_TABS.includes(activeTab) && !isAdmin) {
          setActiveTab('form');
          sanitizeAndSetUrl('form');
        }
      }
    };

    syncRouteWithPermissions();

    const handleUrlChange = () => {
      syncRouteWithPermissions();
    };

    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);

    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [isAdmin]);

  // Se o estado de isAdmin for falso ou for revogado, forçar saída de abas administrativas imediatamente
  useEffect(() => {
    if (!isAdmin && ADMIN_TABS.includes(activeTab)) {
      setActiveTab('form');
      sanitizeAndSetUrl('form');
    }
  }, [isAdmin, activeTab]);

  const toggleTheme = async () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { theme: newTheme }, { merge: true });
        toast.success(`Modo ${newTheme === 'dark' ? 'escuro' : 'claro'} ativado`);
      } catch (error) {
        console.error("Error updating theme", error);
      }
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        const userEmail = result.user.email?.toLowerCase().trim() || '';
        let adminStatus = false;
        if (userEmail === 'isadora.mlima@ufpe.br' || userEmail === 'isadora.mlima@ufpe' || userEmail.startsWith('isadora.mlima@ufpe')) {
          adminStatus = true;
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', userEmail));
          adminStatus = adminDoc.exists() && adminDoc.data().email?.toLowerCase().trim() === userEmail;
        }
        setIsAdmin(adminStatus);

        let role = '';
        const respQ = query(collection(db, 'responses'), where('userId', '==', result.user.uid));
        const respSnap = await getDocs(respQ);
        if (!respSnap.empty) {
          role = respSnap.docs[0].data().leagueRole || '';
        } else if (result.user.email) {
          const emailQ = query(collection(db, 'responses'), where('email', '==', result.user.email));
          const emailSnap = await getDocs(emailQ);
          if (!emailSnap.empty) {
            role = emailSnap.docs[0].data().leagueRole || '';
          }
        }
        setUserLeagueRole(role);
        const isRH = role.toLowerCase().includes('rh') || role.toLowerCase().includes('recursos humanos') || userEmail === 'isadora.mlima@ufpe.br' || userEmail.startsWith('isadora.mlima@ufpe');
        const userRef = doc(db, 'users', result.user.uid);
        await setDoc(userRef, { isRH, leagueRole: role }, { merge: true });
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      const messages: Record<string, string> = {
        'auth/unauthorized-domain': `Este domínio (${window.location.hostname}) ainda não foi autorizado no Firebase. Adicione-o em Authentication > Settings > Authorized domains.`,
        'auth/operation-not-allowed': 'O login com Google ainda não está habilitado no Firebase.',
        'auth/popup-blocked': 'O navegador bloqueou a janela de login. Permita pop-ups para este site e tente novamente.',
        'auth/popup-closed-by-user': 'A janela de login foi fechada antes da conclusão.',
      };
      setLoginError(messages[err?.code] || 'Não foi possível entrar com o Google. Verifique o console do navegador para mais detalhes.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-dark)] flex items-center justify-center text-[var(--color-ink)] font-sans">
        <div className="w-full max-w-md p-8 border border-[var(--color-ink-faint)] bg-[rgba(255,255,255,0.02)] transition-colors">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 flex items-center justify-center">
              <img
                src="./laje.png"
                alt="Logo LAJE"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <h1 className="font-['Syne'] text-[1.8rem] uppercase font-bold tracking-[-0.04em] mb-2 text-[var(--color-ink)]">Laje RH</h1>
              <p className="font-['Space_Mono'] uppercase tracking-[0.1em] text-[0.7rem] text-[var(--color-ink-muted)]">Acesso Restrito ao Portal</p>
            </div>
            
            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] border-none text-[var(--color-ink)] py-3 px-4 transition-all duration-200 font-bold disabled:opacity-50 cursor-pointer"
            >
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <svg viewBox="0 0 48 48" className="w-4 h-4">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              {isLoggingIn ? 'Autenticando...' : 'ENTRAR COM GOOGLE'}
            </button>
            {loginError && (
              <p className="w-full text-left text-sm text-red-400" role="alert">
                {loginError}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-hidden grid grid-cols-1 md:grid-cols-[240px_1fr] grid-rows-[auto_1fr] bg-[var(--color-bg-dark)] text-[var(--color-ink)]">
      <header className="col-span-full px-8 py-4 border-b border-[var(--color-ink-faint)] flex justify-between items-center bg-[rgba(12,12,14,0.8)] backdrop-blur-md z-[100]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center">
            <img
              src="./laje.png"
              alt="Logo LAJE"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-[1.2rem] font-['Syne'] font-bold tracking-[-0.04em] text-[var(--color-ink)] uppercase">Laje RH</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--color-accent)] font-['Space_Mono'] text-[0.75rem] hidden sm:inline-block uppercase tracking-[0.1em]">{user?.email}</span>
          <div className="flex items-center gap-3">
            <button 
              onClick={logout}
              className="bg-transparent border-none cursor-pointer text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] flex items-center gap-1.5 font-medium text-[0.85rem] transition-colors"
            >
              <LogOut size={18} />
              Sair
            </button>
          </div>
        </div>
      </header>

      <aside className="hidden md:flex border-r border-[var(--color-ink-faint)] py-8 px-4 flex-col gap-2">
        <div className="font-['Space_Mono'] uppercase tracking-[0.1em] text-[0.7rem] mb-3 px-4 opacity-50">Aplicações</div>
        <button
          onClick={() => handleTabChange('form')}
          className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
            activeTab === 'form' 
              ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <Terminal size={18} />
          Formulário RH
        </button>
        <button
          onClick={() => handleTabChange('projects')}
          className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
            activeTab === 'projects' 
              ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <Gamepad2 size={18} />
          Projetos & Oportunidades
        </button>
        <button
          onClick={() => handleTabChange('calendar')}
          className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
            activeTab === 'calendar' 
              ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
          }`}
        >
          <CalendarIcon size={18} />
          Calendário
        </button>
        
        {isAdmin && (
          <>
            <div className="font-['Space_Mono'] uppercase tracking-[0.1em] text-[0.7rem] mb-3 mt-6 px-4 opacity-50">Administração</div>
            <button
              onClick={() => handleTabChange('dashboard')}
              className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
                activeTab === 'dashboard' 
                  ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <LayoutDashboard size={18} />
              Dashboard
            </button>
            <button
              onClick={() => handleTabChange('logs')}
              className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
                activeTab === 'logs' 
                  ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <History size={18} />
              Log de Alterações
            </button>
            <button
              onClick={() => handleTabChange('settings')}
              className={`flex items-center gap-3 px-4 py-3 rounded-md font-medium text-[0.9rem] transition-all w-full text-left border-none cursor-pointer ${
                activeTab === 'settings' 
                  ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                  : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <Settings size={18} />
              Administradores
            </button>
          </>
        )}
      </aside>

      <main className="app-main p-8 overflow-y-auto bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.05),transparent_40%)]">
        {/* Navegação compacta para telas menores */}
        <nav className="flex md:hidden flex-wrap gap-2 mb-8 pb-2">
          <button
            onClick={() => handleTabChange('form')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'form' 
                ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
            }`}
          >
            Formulário
          </button>
          <button
            onClick={() => handleTabChange('projects')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'projects' 
                ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
            }`}
          >
            Projetos & Oportunidades
          </button>
          <button
            onClick={() => handleTabChange('calendar')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'calendar' 
                ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
            }`}
          >
            Calendário
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => handleTabChange('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'dashboard' 
                    ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => handleTabChange('logs')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'logs' 
                    ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                Logs
              </button>
              <button
                onClick={() => handleTabChange('settings')}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                  activeTab === 'settings' 
                    ? 'bg-[var(--color-ink-faint)] text-[var(--color-ink)]' 
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-[rgba(255,255,255,0.03)]'
                }`}
              >
                Administradores
              </button>
            </>
          )}
        </nav>

        <div className="w-full">
          {activeTab === 'form' && <Form user={user} token={token || ''} />}
          {activeTab === 'projects' && (
            <ProjectsHub 
              isAdmin={isAdmin} 
              currentUserEmail={user?.email || ''} 
              currentUserName={user?.displayName || user?.email?.split('@')[0] || 'Membro'} 
              currentUserRole={userLeagueRole}
              token={token || ''}
            />
          )}
          {activeTab === 'calendar' && <CalendarTab isAdmin={isAdmin} token={token || ''} />}
          
          {activeTab === 'dashboard' && (
            isAdmin ? (
              <Dashboard isAdmin={isAdmin} onNavigateTab={handleTabChange} />
            ) : (
              <AdminAccessBlocked 
                title="Acesso Restrito: Dashboard" 
                onNavigateHome={() => handleTabChange('form')} 
              />
            )
          )}

          {activeTab === 'logs' && (
            isAdmin ? (
              <AuditLogs 
                isAdmin={isAdmin} 
                currentUserEmail={user?.email || ''} 
                onNavigateHome={() => handleTabChange('form')} 
              />
            ) : (
              <AdminAccessBlocked 
                title="Acesso Restrito: Log de Alterações" 
                onNavigateHome={() => handleTabChange('form')} 
              />
            )
          )}

          {activeTab === 'settings' && (
            isAdmin ? (
              <AdminSettings 
                isAdmin={isAdmin} 
                onNavigateHome={() => handleTabChange('form')} 
              />
            ) : (
              <AdminAccessBlocked 
                title="Acesso Restrito: Administradores" 
                onNavigateHome={() => handleTabChange('form')} 
              />
            )
          )}
        </div>
      </main>
    </div>
  );
}
