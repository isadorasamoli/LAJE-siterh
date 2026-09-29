import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/utils';
import { getAuth } from 'firebase/auth';
import { ChevronLeft, ChevronRight, Plus, Loader2, X, Calendar as CalendarIcon, Clock, Trash2, Edit2, Search } from 'lucide-react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, 
  isSameDay, isToday, parseISO
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import { sendEventNotification } from '../lib/workspace';

interface CalendarProps {
  isAdmin: boolean;
  token: string;
}

interface MemberBirthday {
  id: string;
  memberId: string;
  name: string;
  email: string;
  birthday: string;
  leagueRole: string;
  status: string;
}

export default function CalendarTab({ isAdmin, token }: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [memberBirthdays, setMemberBirthdays] = useState<MemberBirthday[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedBirthday, setSelectedBirthday] = useState<{
    name: string;
    email: string;
    leagueRole: string;
    birthday: string;
    age?: number;
    date: Date;
  } | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: '1 hora',
    time: '14:00'
  });

  const [searchQuery, setSearchQuery] = useState('');

  const auth = getAuth();

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'events'), orderBy('date', 'asc'));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEvents(docs);

      const responseSnap = await getDocs(collection(db, 'responses'));
      const bdays: MemberBirthday[] = [];
      responseSnap.docs.forEach(docSnap => {
        const d = docSnap.data();
        if (d.status !== 'Ex-membro' && d.birthday && typeof d.birthday === 'string' && d.birthday.trim()) {
          bdays.push({
            id: `bday-${docSnap.id}`,
            memberId: docSnap.id,
            name: d.name || 'Membro',
            email: d.email || '',
            birthday: d.birthday.trim(),
            leagueRole: d.leagueRole || '',
            status: d.status || 'Ativo',
          });
        }
      });
      setMemberBirthdays(bdays);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handlePrevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const handleNextMonth = () => setCurrentDate(addMonths(currentDate, 1));

  const handleDayClick = (day: Date) => {
    if (!isAdmin) return;
    setSelectedDate(day);
    setEditingEventId(null);
    setFormData({ title: '', description: '', duration: '1 hora', time: '14:00' });
    setIsModalOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, event: any) => {
    e.stopPropagation();
    
    const d = new Date(event.date);
    setSelectedDate(d);
    setEditingEventId(event.id);
    setFormData({
      title: event.title,
      description: event.description,
      duration: event.duration,
      time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    });
    setIsModalOpen(true);
  };

  const handleDeleteRequest = (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    setEventToDelete(eventId);
    setDeleteConfirmOpen(true);
  };

  const sendEventEmail = async (eventData: any, type: 'create' | 'update' | 'delete') => {
    if (!token) return;
    try {
      const responseSnap = await getDocs(collection(db, 'responses'));
      const emails = responseSnap.docs
        .map(response => response.data().email)
        .filter((email): email is string => Boolean(email));
      await sendEventNotification(token, emails, eventData, type);
    } catch (e) {
      console.info('Notificação por e-mail de evento não pôde ser enviada:', e);
    }
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;
    try {
      const eventRecord = events.find(e => e.id === eventToDelete);
      await deleteDoc(doc(db, 'events', eventToDelete));
      toast.success('Evento excluído com sucesso');
      if (eventRecord) {
        await sendEventEmail(eventRecord, 'delete');
      }
      fetchEvents();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'events');
      toast.error('Erro ao excluir evento');
    } finally {
      setDeleteConfirmOpen(false);
      setEventToDelete(null);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const eventDate = new Date(selectedDate);
      const [hours, minutes] = formData.time.split(':');
      eventDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

      const eventData = {
        title: formData.title,
        description: formData.description,
        duration: formData.duration,
        date: eventDate.toISOString()
      };

      if (editingEventId) {
        await updateDoc(doc(db, 'events', editingEventId), eventData);
        toast.success('Evento atualizado com sucesso!');
        await sendEventEmail(eventData, 'update');
      } else {
        const newEvent = {
          ...eventData,
          userId: auth.currentUser?.uid || '',
          createdAt: Date.now()
        };
        await addDoc(collection(db, 'events'), newEvent);
        toast.success('Evento criado com sucesso!');
        await sendEventEmail(eventData, 'create');
      }
      
      setIsModalOpen(false);
      setFormData({ title: '', description: '', duration: '1 hora', time: '14:00' });
      fetchEvents();
    } catch (error) {
      handleFirestoreError(error, editingEventId ? OperationType.UPDATE : OperationType.CREATE, 'events');
      toast.error('Erro ao salvar evento');
    } finally {
      setIsSubmitting(false);
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const parseBirthdayDate = (birthdayStr: string, targetDay: Date) => {
    if (!birthdayStr) return { matches: false };
    let birthYear: number | null = null;
    let birthMonth: number | null = null;
    let birthDay: number | null = null;

    if (birthdayStr.includes('-')) {
      const parts = birthdayStr.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          birthYear = parseInt(parts[0], 10);
          birthMonth = parseInt(parts[1], 10);
          birthDay = parseInt(parts[2], 10);
        } else {
          birthDay = parseInt(parts[0], 10);
          birthMonth = parseInt(parts[1], 10);
          birthYear = parseInt(parts[2], 10);
        }
      }
    } else if (birthdayStr.includes('/')) {
      const parts = birthdayStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 4) {
          birthDay = parseInt(parts[0], 10);
          birthMonth = parseInt(parts[1], 10);
          birthYear = parseInt(parts[2], 10);
        } else if (parts[0].length === 4) {
          birthYear = parseInt(parts[0], 10);
          birthMonth = parseInt(parts[1], 10);
          birthDay = parseInt(parts[2], 10);
        }
      }
    }

    if (!birthMonth || !birthDay || isNaN(birthMonth) || isNaN(birthDay)) {
      return { matches: false };
    }

    const targetMonth = targetDay.getMonth() + 1;
    const targetDayNum = targetDay.getDate();

    let matches = birthMonth === targetMonth && birthDay === targetDayNum;
    if (!matches && birthMonth === 2 && birthDay === 29 && targetMonth === 2 && targetDayNum === 28) {
      const yr = targetDay.getFullYear();
      const isLeap = (yr % 4 === 0 && yr % 100 !== 0) || (yr % 400 === 0);
      if (!isLeap) matches = true;
    }

    let age: number | undefined;
    if (matches && birthYear && !isNaN(birthYear)) {
      age = targetDay.getFullYear() - birthYear;
      if (age < 0) age = undefined;
    }

    return { matches, age };
  };

  const isBirthdayMatchingSearch = (bday: MemberBirthday) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      bday.name.toLowerCase().includes(q) ||
      bday.email.toLowerCase().includes(q) ||
      bday.leagueRole.toLowerCase().includes(q) ||
      'aniversário'.includes(q) ||
      'aniversario'.includes(q) ||
      'parabéns'.includes(q) ||
      'parabens'.includes(q)
    );
  };

  const filteredEvents = events.filter(e => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      (e.title && e.title.toLowerCase().includes(lowerQuery)) ||
      (e.description && e.description.toLowerCase().includes(lowerQuery))
    );
  });

  return (
    <div className="w-full max-w-5xl mx-auto pb-12">
      {/* Search Bar */}
      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 text-[var(--color-ink)]" size={20} />
        <input 
          type="text" 
          placeholder="BUSCAR EVENTOS OU ANIVERSÁRIOS..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full max-w-[500px] bg-transparent border border-[var(--color-ink-faint)] py-[14px] pl-[44px] pr-[14px] text-[var(--color-ink)] font-['Space_Mono'] text-[0.85rem] outline-none focus:border-[var(--color-accent)] uppercase transition-colors"
        />
      </div>

      <div className="bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] p-6">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="font-['Syne'] uppercase text-[1.8rem] font-bold text-[var(--color-ink)] tracking-[-0.04em]">
            {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          <div className="flex gap-2">
            <button onClick={handlePrevMonth} className="bg-[var(--color-ink-faint)] border-none p-2 cursor-pointer text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.1)] transition-colors">
              <ChevronLeft size={20} />
            </button>
            <button onClick={handleNextMonth} className="bg-[var(--color-ink-faint)] border-none p-2 cursor-pointer text-[var(--color-ink)] hover:bg-[rgba(255,255,255,0.1)] transition-colors">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="grid grid-cols-7 gap-[1px] bg-[var(--color-ink-faint)] border border-[var(--color-ink-faint)]">
          {/* Days of week */}
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
            <div key={day} className="bg-[var(--color-bg-dark)] p-3 text-center text-[var(--color-ink-muted)] text-[0.65rem] font-bold uppercase tracking-[0.1em]">
              {day}
            </div>
          ))}

          {loading ? (
            <div className="col-span-7 bg-[var(--color-bg-dark)] py-20 flex justify-center text-[var(--color-accent)]">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : (
            days.map((day, idx) => {
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isTodayDate = isToday(day);
              
              // Find events for this day
              const dayEvents = filteredEvents.filter(e => {
                if (!e.date) return false;
                return isSameDay(parseISO(e.date), day);
              });

              // Find birthdays for this day
              const dayBirthdays = memberBirthdays
                .filter(isBirthdayMatchingSearch)
                .map(m => {
                  const { matches, age } = parseBirthdayDate(m.birthday, day);
                  if (!matches) return null;
                  return {
                    ...m,
                    age,
                    day
                  };
                })
                .filter(Boolean) as (MemberBirthday & { age?: number; day: Date })[];

              return (
                <div 
                  key={idx} 
                  onClick={() => handleDayClick(day)}
                  className={`bg-[var(--color-bg-dark)] min-h-[120px] p-3 relative transition-colors cursor-pointer group flex flex-col ${
                    !isCurrentMonth ? 'opacity-25' : 
                    isTodayDate ? 'bg-[rgba(16,185,129,0.03)] hover:bg-[rgba(255,255,255,0.03)]' : 
                    'hover:bg-[rgba(255,255,255,0.03)]'
                  }`}
                >
                  <span className={`font-['Space_Mono'] text-[0.8rem] mb-2 self-start ${
                    isTodayDate ? 'bg-[var(--color-accent)] text-[var(--color-bg-dark)] px-1.5 rounded-sm' : ''
                  }`}>
                    {format(day, 'd')}
                  </span>
                  
                  {isAdmin && (
                    <button className="absolute top-2 right-2 opacity-0 group-hover:opacity-50 cursor-pointer bg-transparent border-none text-[var(--color-ink)] transition-opacity">
                      <Plus size={14} />
                    </button>
                  )}
                  
                  <div className="flex-1 overflow-y-auto space-y-1 scrollbar-none w-full">
                    {/* Birthdays first */}
                    {dayBirthdays.map(bday => (
                      <div 
                        key={bday.id} 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBirthday({
                            name: bday.name,
                            email: bday.email,
                            leagueRole: bday.leagueRole,
                            birthday: bday.birthday,
                            age: bday.age,
                            date: day
                          });
                        }}
                        className="bg-amber-400/20 border border-amber-400/40 text-amber-300 hover:bg-amber-400/30 text-[0.65rem] px-2 py-1 rounded-sm mt-1 font-bold cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis w-full text-left flex items-center gap-1 transition-colors shadow-sm"
                        title={`Aniversário: ${bday.name}`}
                      >
                        <span className="shrink-0 text-[11px] leading-none">🎂</span>
                        <span className="truncate">{bday.name}{bday.age ? ` (${bday.age})` : ''}</span>
                      </div>
                    ))}

                    {/* Regular events */}
                    {dayEvents.map(evt => (
                      <div 
                        key={evt.id} 
                        onClick={(e) => handleEventClick(e, evt)}
                        className="bg-[var(--color-accent)] text-[var(--color-bg-dark)] text-[0.65rem] px-2 py-1 rounded-sm mt-1 font-bold cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis w-full text-left"
                      >
                        {format(parseISO(evt.date), 'HH:mm')} - {evt.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteConfirmOpen(false)}>
          <div className="bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] w-full max-w-sm  shadow-2xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <Trash2 className="mx-auto text-red-500 mb-4" size={32} />
            <h3 className="text-lg font-bold text-[var(--color-ink)] mb-2">Excluir Evento</h3>
            <p className="text-sm text-[var(--color-ink-muted)] mb-6">Tem certeza que deseja excluir este evento? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-800 text-[var(--color-ink)]  hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 bg-red-500/20 text-red-500 border border-red-500/30  hover:bg-red-500 hover:text-[var(--color-ink)] transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}>
          <div className="bg-[var(--color-bg-dark)] border border-[var(--color-ink-faint)] w-full max-w-md shadow-2xl p-8" onClick={e => e.stopPropagation()}>
            {!isAdmin ? (
              <div>
                 <h3 className="text-lg font-bold text-[var(--color-ink)] font-['Syne'] uppercase flex items-center gap-2 mb-6">
                    <CalendarIcon className="text-[var(--color-accent)]" size={20} />
                    Detalhes do Evento
                 </h3>
                 <div className="space-y-6">
                    <div>
                       <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Título</h4>
                       <p className="text-[var(--color-ink)] font-bold text-lg">{formData.title}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div>
                           <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Horário</h4>
                           <p className="text-[var(--color-ink)]">{format(selectedDate, 'dd/MM/yyyy')} às {formData.time}</p>
                       </div>
                       <div>
                           <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Duração</h4>
                           <p className="text-[var(--color-ink)]">{formData.duration}</p>
                       </div>
                    </div>
                    <div>
                       <h4 className="text-[0.65rem] font-bold uppercase text-[var(--color-ink-muted)] font-['Space_Mono'] mb-1">Descrição</h4>
                       <p className="text-[var(--color-ink)] whitespace-pre-wrap leading-relaxed">{formData.description}</p>
                    </div>
                 </div>
                 <button onClick={() => setIsModalOpen(false)} className="mt-8 w-full px-4 py-3 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--color-ink)] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none font-['Space_Mono']">
                    Fechar
                 </button>
              </div>
            ) : (
            <>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-[var(--color-ink)] font-['Syne'] uppercase flex items-center gap-2">
                <CalendarIcon className="text-[var(--color-accent)]" size={20} />
                {editingEventId ? 'Editar Evento' : 'Novo Evento'}
              </h3>
              <div className="flex items-center gap-2">
                {editingEventId && (
                  <button 
                    onClick={(e) => handleDeleteRequest(e, editingEventId)} 
                    className="text-[var(--color-ink-muted)] hover:text-red-400 transition-colors bg-transparent border-none cursor-pointer"
                    title="Excluir Evento"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button onClick={() => setIsModalOpen(false)} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent border-none cursor-pointer">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <p className="text-sm text-[var(--color-ink-muted)] mb-6 font-['Space_Mono']">
              Criando evento para <strong className="text-[var(--color-accent)]">{format(selectedDate, 'dd/MM/yyyy')}</strong>
            </p>
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Título do Evento</label>
                <input 
                  required 
                  autoFocus
                  value={formData.title} 
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="Ex: Reunião Geral"
                  className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all" 
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Horário</label>
                  <input 
                    required 
                    type="time"
                    value={formData.time} 
                    onChange={e => setFormData({...formData, time: e.target.value})}
                    className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all [color-scheme:dark]" 
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Duração</label>
                  <input 
                    required 
                    value={formData.duration} 
                    onChange={e => setFormData({...formData, duration: e.target.value})}
                    placeholder="Ex: 2 horas"
                    className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all" 
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-[var(--color-ink-muted)] mb-1 block">Descrição</label>
                <textarea 
                  required 
                  rows={3}
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  placeholder="Detalhes do evento..."
                  className="w-full bg-transparent border border-[var(--color-ink-faint)] focus:border-[var(--color-accent)] text-[var(--color-ink)] p-2.5  outline-none transition-all resize-none" 
                />
              </div>

              <div className="pt-2">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--color-accent)] hover:bg-[#0ea5e9] text-[var(--color-bg-dark)] border-none uppercase font-['Space_Mono'] font-bold  px-4 py-3 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Salvar Evento'}
                </button>
              </div>
            </form>
            </>
            )}
          </div>
        </div>
      )}

      {/* Birthday Celebration Modal */}
      {selectedBirthday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedBirthday(null)}>
          <div className="bg-[var(--color-bg-dark)] border border-amber-400/40 w-full max-w-md shadow-2xl p-8 relative overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-pink-400 to-emerald-400" />
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-[var(--color-ink)] font-['Syne'] uppercase flex items-center gap-2">
                <span className="text-2xl">🎂</span>
                Aniversário do Membro
              </h3>
              <button onClick={() => setSelectedBirthday(null)} className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] bg-transparent border-none cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-5 bg-amber-400/10 border border-amber-400/20 text-center rounded-sm">
                <div className="text-4xl mb-2">🎉</div>
                <h4 className="text-xl font-bold text-[var(--color-ink)] font-['Syne']">{selectedBirthday.name}</h4>
                {selectedBirthday.age ? (
                  <p className="text-xs font-bold text-amber-300 font-['Space_Mono'] mt-1">
                    Comemorando {selectedBirthday.age} anos hoje! 🎈
                  </p>
                ) : (
                  <p className="text-xs font-bold text-amber-300 font-['Space_Mono'] mt-1">
                    Dia de festa na LAJE! 🎈
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Data</span>
                  <span className="text-[var(--color-ink)] font-semibold font-['Space_Mono'] text-sm">
                    {format(selectedBirthday.date, 'dd/MM')}
                  </span>
                </div>
                <div className="p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)]">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Status</span>
                  <span className="text-emerald-400 font-semibold text-xs">Membro Ativo</span>
                </div>
              </div>

              {selectedBirthday.leagueRole && (
                <div className="p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] text-sm">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Função na LAJE</span>
                  <span className="text-[var(--color-accent)] font-semibold">{selectedBirthday.leagueRole}</span>
                </div>
              )}

              {selectedBirthday.email && (
                <div className="p-3 bg-[rgba(255,255,255,0.02)] border border-[var(--color-ink-faint)] text-sm">
                  <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">E-mail</span>
                  <span className="text-gray-300 font-medium text-xs break-all">{selectedBirthday.email}</span>
                </div>
              )}
            </div>

            <button onClick={() => setSelectedBirthday(null)} className="mt-6 w-full px-4 py-3 bg-[var(--color-ink-faint)] hover:bg-[rgba(255,255,255,0.1)] text-[var(--color-ink)] font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border-none font-['Space_Mono']">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
