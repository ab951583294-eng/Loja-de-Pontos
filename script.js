// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================
const SUPABASE_URL = 'https://yvpmptaczeitafibnawh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cG1wdGFjemVpdGFmaWJuYXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTM3NTUsImV4cCI6MjEwMzU4OTc1NX0.WIjjlyZw6qDX8et7DQgm3ddPQ8YrY57MDSRk-FKNVZ0';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// CLASSE DATABASE
// ============================================================
class Database {
    async getAll(table) {
        const { data, error } = await supabaseClient
            .from(table)
            .select('*')
            .order('id', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async get(table, id) {
        const { data, error } = await supabaseClient
            .from(table)
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    async add(table, data) {
        const { data: result, error } = await supabaseClient
            .from(table)
            .insert([data])
            .select()
            .single();
        if (error) throw error;
        return result;
    }

    async update(table, data) {
        const { error } = await supabaseClient
            .from(table)
            .update(data)
            .eq('id', data.id);
        if (error) throw error;
        return true;
    }

    async delete(table, id) {
        const { error } = await supabaseClient
            .from(table)
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    }

    async query(table, filters) {
        let query = supabaseClient.from(table).select('*');
        if (filters) {
            Object.keys(filters).forEach(key => {
                query = query.eq(key, filters[key]);
            });
        }
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }
}

// ============================================================
// CLASSE PRINCIPAL
// ============================================================
class LojaDePontos {
    constructor() {
        this.db = new Database();
        this.currentUser = null;
        this.activeTimers = {};
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.showLoading(true);
            await Promise.all([
                this.loadUsuarios(),
                this.loadAcoes(),
                this.loadRecompensas()
            ]);
            this.setupAdminForms();
        } catch (error) {
            console.error('Erro ao inicializar:', error);
            this.showModal('Erro', 'Não foi possível conectar.');
        } finally {
            this.showLoading(false);
        }
    }

    setupEventListeners() {
        document.getElementById('btnDashboard').addEventListener('click', () => this.switchPage('dashboard'));
        document.getElementById('btnAdmin').addEventListener('click', () => this.switchPage('admin'));
        document.getElementById('selectUser').addEventListener('change', (e) => this.selectUser(e.target.value));
        
        document.querySelectorAll('.main-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchMainTab(e.target.dataset.tab));
        });
        
        document.querySelectorAll('.history-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchHistoryTab(e.target.dataset.tab));
        });
        
        document.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('modalBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') this.hideModal();
        });
    }

    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(page).classList.add('active');
        const btnId = page === 'dashboard' ? 'btnDashboard' : 'btnAdmin';
        document.getElementById(btnId).classList.add('active');
        
        if (page === 'dashboard' && this.currentUser) {
            this.loadComprasAtivas();
        }
    }

    switchMainTab(tab) {
        document.querySelectorAll('.main-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`.main-tabs [data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        if (tab === 'compras' && this.currentUser) {
            this.loadComprasAtivas();
        }
    }

    switchHistoryTab(tab) {
        document.querySelectorAll('.history-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-content').forEach(c => c.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`historico${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
    }

    showLoading(show) {
        const loading = document.getElementById('loading');
        if (show) loading.classList.add('active');
        else loading.classList.remove('active');
    }

    // ============================================================
    // USUÁRIOS
    // ============================================================
    async loadUsuarios() {
        const usuarios = await this.db.getAll('usuarios');
        const select = document.getElementById('selectUser');
        const usuariosList = document.getElementById('usuariosList');
        
        // Salvar seleção atual
        const selectedUserId = this.currentUser ? this.currentUser.id : select.value;
        
        select.innerHTML = '<option value="">-- Selecione --</option>';
        usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.pontos_totais} pts)`;
            select.appendChild(option);
        });
        
        // Restaurar seleção
        if (selectedUserId) {
            select.value = selectedUserId;
        }

        usuariosList.innerHTML = '';
        if (usuarios.length === 0) {
            usuariosList.innerHTML = '<p class="empty-state">Nenhum usuário</p>';
        } else {
            usuarios.forEach(usuario => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `
                    <div class="list-item-info">
                        <div class="list-item-name">${usuario.nome}</div>
                        <div class="list-item-points">${usuario.pontos_totais} pontos</div>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-secondary" onclick="app.zerarPontos(${usuario.id})" title="Zerar">↺</button>
                        <button class="btn btn-secondary" onclick="app.zerarHistorico(${usuario.id})" title="Limpar histórico">✕</button>
                        <button class="btn btn-danger" onclick="app.deleteUsuario(${usuario.id})">Excluir</button>
                    </div>
                `;
                usuariosList.appendChild(item);
            });
        }
    }

    async selectUser(userId) {
        if (!userId) {
            this.currentUser = null;
            document.getElementById('totalPoints').textContent = '0';
            document.getElementById('historicoAcoes').innerHTML = '<p class="empty-state">Selecione um usuário</p>';
            document.getElementById('historicoCompras').innerHTML = '<p class="empty-state">Selecione um usuário</p>';
            document.getElementById('comprasAtivasList').innerHTML = '<p class="empty-state">Selecione um usuário</p>';
            return;
        }
        this.currentUser = await this.db.get('usuarios', parseInt(userId));
        this.updatePointsDisplay();
        await this.loadHistorico();
        await this.loadRecompensas();
        await this.loadComprasAtivas();
    }

    updatePointsDisplay() {
        if (this.currentUser) {
            document.getElementById('totalPoints').textContent = this.currentUser.pontos_totais;
        }
    }

    // ============================================================
    // AÇÕES
    // ============================================================
    async loadAcoes() {
        const acoes = await this.db.getAll('acoes');
        const acoesList = document.getElementById('acoesList');
        const adminAcoesList = document.getElementById('adminAcoesList');
        
        acoesList.innerHTML = '';
        adminAcoesList.innerHTML = '';

        if (acoes.length === 0) {
            acoesList.innerHTML = '<p class="empty-state">Nenhuma ação</p>';
            adminAcoesList.innerHTML = '<p class="empty-state">Nenhuma ação</p>';
            return;
        }

        acoes.forEach(acao => {
            const pointsClass = acao.valor_pontos >= 0 ? '' : 'negative';
            const pointsText = acao.valor_pontos >= 0 ? `+${acao.valor_pontos}` : acao.valor_pontos;
            
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${acao.descricao}</div>
                    <div class="list-item-points ${pointsClass}">${pointsText} pontos</div>
                </div>
                <button class="btn btn-register" onclick="app.registrarAcao(${acao.id})">Registrar</button>
            `;
            acoesList.appendChild(item);

            const adminItem = document.createElement('div');
            adminItem.className = 'list-item';
            adminItem.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${acao.descricao}</div>
                    <div class="list-item-points ${pointsClass}">${pointsText} pontos</div>
                </div>
                <button class="btn btn-danger" onclick="app.deleteAcao(${acao.id})">Excluir</button>
            `;
            adminAcoesList.appendChild(adminItem);
        });
    }

    async registrarAcao(acaoId) {
        if (!this.currentUser) {
            this.showModal('Atenção', 'Selecione um usuário.');
            return;
        }
        this.showLoading(true);
        try {
            const acao = await this.db.get('acoes', acaoId);
            await this.db.add('historico_acoes', {
                data: new Date().toISOString(),
                usuario_id: this.currentUser.id,
                acao_id: acaoId,
                pontos_ganhos_perdidos: acao.valor_pontos
            });
            this.currentUser.pontos_totais += acao.valor_pontos;
            await this.db.update('usuarios', this.currentUser);
            this.updatePointsDisplay();
            await this.loadHistorico();
            await this.loadRecompensas();
            await this.loadUsuarios();
            this.showModal('Registrado', `${acao.descricao} - ${acao.valor_pontos >= 0 ? '+' : ''}${acao.valor_pontos} pts`);
        } catch (error) {
            this.showModal('Erro', 'Não foi possível registrar.');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // RECOMPENSAS
    // ============================================================
    async loadRecompensas() {
        const recompensas = await this.db.getAll('recompensas');
        const recompensasList = document.getElementById('recompensasList');
        const adminRecompensasList = document.getElementById('adminRecompensasList');
        
        recompensasList.innerHTML = '';
        adminRecompensasList.innerHTML = '';

        if (recompensas.length === 0) {
            recompensasList.innerHTML = '<p class="empty-state" style="grid-column: 1/-1;">Nenhuma recompensa</p>';
            adminRecompensasList.innerHTML = '<p class="empty-state">Nenhuma recompensa</p>';
            return;
        }

        recompensas.forEach(recompensa => {
            const card = document.createElement('div');
            card.className = 'reward-card';
            
            const imagemHTML = recompensa.imagem_url 
                ? `<img src="${recompensa.imagem_url}" alt="${recompensa.nome}" onerror="this.style.display='none'">`
                : '';
            
            const temTempo = recompensa.tempo_minutos > 0;
            
            let buttonHTML = '';
            if (this.currentUser) {
                const canBuy = this.currentUser.pontos_totais >= recompensa.custo_pontos;
                const disabled = !canBuy ? 'disabled' : '';
                
                if (temTempo) {
                    buttonHTML = `
                        <div class="reward-cost">${recompensa.custo_pontos} pts | ${recompensa.tempo_minutos} min</div>
                        <button class="btn btn-buy" onclick="app.comprarRecompensaTempo(${recompensa.id})" ${disabled}>
                            ${canBuy ? 'Comprar' : 'Pontos insuficientes'}
                        </button>
                    `;
                } else {
                    buttonHTML = `
                        <div class="reward-cost">${recompensa.custo_pontos} pts</div>
                        <button class="btn btn-buy" onclick="app.comprarRecompensaTicket(${recompensa.id})" ${disabled}>
                            ${canBuy ? 'Comprar' : 'Pontos insuficientes'}
                        </button>
                    `;
                }
            } else {
                buttonHTML = `
                    <div class="reward-cost">${recompensa.custo_pontos} pts${temTempo ? ` | ${recompensa.tempo_minutos} min` : ''}</div>
                    <button class="btn btn-buy" disabled>Selecione usuário</button>
                `;
            }
            
            card.innerHTML = `${imagemHTML}<h3>${recompensa.nome}</h3>${buttonHTML}`;
            recompensasList.appendChild(card);

            const adminItem = document.createElement('div');
            adminItem.className = 'list-item';
            adminItem.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${recompensa.nome}</div>
                    <div class="list-item-points">${recompensa.custo_pontos} pts${temTempo ? ` | ${recompensa.tempo_minutos} min` : ''}</div>
                </div>
                <button class="btn btn-danger" onclick="app.deleteRecompensa(${recompensa.id})">Excluir</button>
            `;
            adminRecompensasList.appendChild(adminItem);
        });
    }

    // Comprar recompensa de tempo (vai para Minhas Compras)
    async comprarRecompensaTempo(recompensaId) {
        if (!this.currentUser) {
            this.showModal('Atenção', 'Selecione um usuário.');
            return;
        }
        this.showLoading(true);
        try {
            const recompensa = await this.db.get('recompensas', recompensaId);
            if (this.currentUser.pontos_totais < recompensa.custo_pontos) {
                this.showModal('Pontos insuficientes', `Precisa de ${recompensa.custo_pontos} pts.`);
                return;
            }
            
            await this.db.add('historico_compras', {
                data: new Date().toISOString(),
                usuario_id: this.currentUser.id,
                recompensa_id: recompensaId,
                pontos_gastos: recompensa.custo_pontos
            });
            
            await this.db.add('recompensas_ativas', {
                usuario_id: this.currentUser.id,
                recompensa_id: recompensaId,
                data_inicio: null,
                data_fim: null,
                tempo_restante_segundos: recompensa.tempo_minutos * 60,
                pausada: true,
                concluida: false
            });
            
            this.currentUser.pontos_totais -= recompensa.custo_pontos;
            await this.db.update('usuarios', this.currentUser);
            
            this.updatePointsDisplay();
            await this.loadHistorico();
            await this.loadRecompensas();
            await this.loadUsuarios();
            await this.loadComprasAtivas();
            
            this.showModal('Ticket adquirido', `${recompensa.nome} - Vá em "Minhas Compras" para iniciar.`);
        } catch (error) {
            console.error('Erro:', error);
            this.showModal('Erro', 'Não foi possível comprar.');
        } finally {
            this.showLoading(false);
        }
    }

    // Comprar recompensa sem tempo (ticket para usar depois)
    async comprarRecompensaTicket(recompensaId) {
        if (!this.currentUser) {
            this.showModal('Atenção', 'Selecione um usuário.');
            return;
        }
        this.showLoading(true);
        try {
            const recompensa = await this.db.get('recompensas', recompensaId);
            if (this.currentUser.pontos_totais < recompensa.custo_pontos) {
                this.showModal('Pontos insuficientes', `Precisa de ${recompensa.custo_pontos} pts.`);
                return;
            }
            
            await this.db.add('historico_compras', {
                data: new Date().toISOString(),
                usuario_id: this.currentUser.id,
                recompensa_id: recompensaId,
                pontos_gastos: recompensa.custo_pontos
            });
            
            await this.db.add('recompensas_ativas', {
                usuario_id: this.currentUser.id,
                recompensa_id: recompensaId,
                data_inicio: null,
                data_fim: null,
                tempo_restante_segundos: 0,
                pausada: true,
                concluida: false
            });
            
            this.currentUser.pontos_totais -= recompensa.custo_pontos;
            await this.db.update('usuarios', this.currentUser);
            
            this.updatePointsDisplay();
            await this.loadHistorico();
            await this.loadRecompensas();
            await this.loadUsuarios();
            await this.loadComprasAtivas();
            
            this.showModal('Ticket adquirido', `${recompensa.nome} - Vá em "Minhas Compras" para usar.`);
        } catch (error) {
            console.error('Erro:', error);
            this.showModal('Erro', 'Não foi possível comprar.');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // COMPRAS ATIVAS (TICKETS)
    // ============================================================
    async loadComprasAtivas() {
        if (!this.currentUser) {
            document.getElementById('comprasAtivasList').innerHTML = '<p class="empty-state">Selecione um usuário</p>';
            return;
        }

        this.showLoading(true);
        try {
            const compras = await this.db.query('recompensas_ativas', { 
                usuario_id: this.currentUser.id,
                concluida: false 
            });
            
            const lista = document.getElementById('comprasAtivasList');
            lista.innerHTML = '';
            
            if (compras.length === 0) {
                lista.innerHTML = '<p class="empty-state" style="grid-column: 1/-1;">Nenhum ticket ativo</p>';
                return;
            }
            
            const recompensas = await this.db.getAll('recompensas');
            
            for (const compra of compras) {
                const recompensa = recompensas.find(r => r.id === compra.recompensa_id);
                if (!recompensa) continue;
                
                const card = document.createElement('div');
                card.className = 'reward-card';
                
                const temTempo = recompensa.tempo_minutos > 0;
                
                if (temTempo) {
                    // Recompensa de tempo - mostrar timer
                    const tempoFormatado = this.formatarTempo(compra.tempo_restante_segundos);
                    const status = compra.pausada ? 'Pausado' : 'Em andamento';
                    
                    card.innerHTML = `
                        <h3>${recompensa.nome}</h3>
                        <div class="timer-display" id="timer-${compra.id}">${tempoFormatado}</div>
                        <div class="timer-status">${status}</div>
                        <div class="timer-controls">
                            ${compra.pausada 
                                ? `<button class="btn btn-start" onclick="app.iniciarTimer(${compra.id})">Iniciar</button>`
                                : `<button class="btn btn-pause" onclick="app.pausarTimer(${compra.id})">Pausar</button>`
                            }
                            <button class="btn btn-interrupt" onclick="app.interromperCompra(${compra.id})">Interromper</button>
                        </div>
                        <button class="btn btn-revoke" onclick="app.cancelarTicket(${compra.id})">Cancelar</button>
                    `;
                    
                    lista.appendChild(card);
                    
                    if (!compra.pausada) {
                        this.iniciarTimerVisual(compra.id, compra.tempo_restante_segundos);
                    }
                } else {
                    // Recompensa sem tempo - ticket para usar
                    card.innerHTML = `
                        <h3>${recompensa.nome}</h3>
                        <div class="timer-status">Ticket disponível</div>
                        <div class="timer-controls">
                            <button class="btn btn-start" onclick="app.usarTicket(${compra.id})">Usar Ticket</button>
                        </div>
                        <button class="btn btn-revoke" onclick="app.cancelarTicket(${compra.id})">Cancelar</button>
                    `;
                    
                    lista.appendChild(card);
                }
            }
        } catch (error) {
            console.error('Erro:', error);
            document.getElementById('comprasAtivasList').innerHTML = '<p class="empty-state">Erro ao carregar</p>';
        } finally {
            this.showLoading(false);
        }
    }

    formatarTempo(totalSegundos) {
        if (!totalSegundos || totalSegundos <= 0) return '00:00';
        const minutos = Math.floor(totalSegundos / 60);
        const segundos = totalSegundos % 60;
        return `${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    }

    iniciarTimerVisual(compraId, segundosRestantes) {
        if (this.activeTimers[compraId]) {
            clearInterval(this.activeTimers[compraId]);
        }
        
        let segundos = segundosRestantes;
        
        this.activeTimers[compraId] = setInterval(() => {
            segundos--;
            
            const elemento = document.getElementById(`timer-${compraId}`);
            if (elemento) {
                elemento.textContent = this.formatarTempo(segundos);
            }
            
            if (segundos <= 0) {
                this.finalizarTimer(compraId);
            }
        }, 1000);
    }

    async iniciarTimer(compraId) {
        this.showLoading(true);
        try {
            await this.db.update('recompensas_ativas', {
                id: compraId,
                pausada: false,
                data_inicio: new Date().toISOString()
            });
            
            await this.loadComprasAtivas();
        } catch (error) {
            this.showModal('Erro', 'Não foi possível iniciar.');
        } finally {
            this.showLoading(false);
        }
    }

    async pausarTimer(compraId) {
        this.showLoading(true);
        try {
            await this.db.update('recompensas_ativas', {
                id: compraId,
                pausada: true,
                data_inicio: null
            });
            
            await this.loadComprasAtivas();
        } catch (error) {
            this.showModal('Erro', 'Não foi possível pausar.');
        } finally {
            this.showLoading(false);
        }
    }

    async finalizarTimer(compraId) {
        try {
            if (this.activeTimers[compraId]) {
                clearInterval(this.activeTimers[compraId]);
                delete this.activeTimers[compraId];
            }
            
            await this.db.update('recompensas_ativas', {
                id: compraId,
                concluida: true,
                data_fim: new Date().toISOString()
            });
            
            await this.loadComprasAtivas();
            this.showModal('Tempo esgotado', 'O tempo da recompensa acabou!');
        } catch (error) {
            console.error('Erro:', error);
        }
    }

    async interromperCompra(compraId) {
        if (!confirm('Interromper esta compra? O tempo será cancelado.')) return;
        
        this.showLoading(true);
        try {
            if (this.activeTimers[compraId]) {
                clearInterval(this.activeTimers[compraId]);
                delete this.activeTimers[compraId];
            }
            
            await this.db.update('recompensas_ativas', {
                id: compraId,
                concluida: true,
                data_fim: new Date().toISOString()
            });
            
            await this.loadComprasAtivas();
            this.showModal('Interrompido', 'A compra foi interrompida.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível interromper.');
        } finally {
            this.showLoading(false);
        }
    }

    // Usar ticket (recompensa sem tempo)
    async usarTicket(compraId) {
        if (!confirm('Confirmar uso deste ticket?')) return;
        
        this.showLoading(true);
        try {
            await this.db.update('recompensas_ativas', {
                id: compraId,
                concluida: true,
                data_fim: new Date().toISOString()
            });
            
            await this.loadComprasAtivas();
            this.showModal('Ticket usado', 'O ticket foi confirmado como utilizado.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível usar o ticket.');
        } finally {
            this.showLoading(false);
        }
    }

    // Cancelar ticket (sem devolver pontos)
    async cancelarTicket(compraId) {
        if (!confirm('Cancelar este ticket? Os pontos NÃO serão devolvidos.')) return;
        
        this.showLoading(true);
        try {
            if (this.activeTimers[compraId]) {
                clearInterval(this.activeTimers[compraId]);
                delete this.activeTimers[compraId];
            }
            
            await this.db.update('recompensas_ativas', {
                id: compraId,
                concluida: true,
                data_fim: new Date().toISOString()
            });
            
            await this.loadComprasAtivas();
            this.showModal('Cancelado', 'O ticket foi cancelado.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível cancelar.');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // ZERAR
    // ============================================================
    async zerarPontos(usuarioId) {
        if (!confirm('Zerar os pontos?')) return;
        this.showLoading(true);
        try {
            await this.db.update('usuarios', { id: usuarioId, pontos_totais: 0 });
            await this.loadUsuarios();
            if (this.currentUser && this.currentUser.id === usuarioId) {
                this.currentUser.pontos_totais = 0;
                this.updatePointsDisplay();
            }
            this.showModal('Zerado', 'Pontos resetados.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível zerar.');
        } finally {
            this.showLoading(false);
        }
    }

    async zerarHistorico(usuarioId) {
        if (!confirm('Apagar TODO o histórico?')) return;
        this.showLoading(true);
        try {
            const ha = await this.db.query('historico_acoes', { usuario_id: usuarioId });
            for (const h of ha) await this.db.delete('historico_acoes', h.id);
            const hc = await this.db.query('historico_compras', { usuario_id: usuarioId });
            for (const h of hc) await this.db.delete('historico_compras', h.id);
            const ra = await this.db.query('recompensas_ativas', { usuario_id: usuarioId });
            for (const r of ra) await this.db.delete('recompensas_ativas', r.id);
            await this.loadHistorico();
            await this.loadComprasAtivas();
            this.showModal('Zerado', 'Histórico apagado.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível zerar.');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // HISTÓRICO
    // ============================================================
    async loadHistorico() {
        if (!this.currentUser) return;
        this.showLoading(true);
        try {
            const historicoAcoes = await this.db.getAll('historico_acoes');
            const acoesUsuario = historicoAcoes
                .filter(h => h.usuario_id === this.currentUser.id)
                .sort((a, b) => new Date(b.data) - new Date(a.data))
                .slice(0, 20);
            
            const acoesList = document.getElementById('historicoAcoes');
            acoesList.innerHTML = '';
            if (acoesUsuario.length === 0) {
                acoesList.innerHTML = '<p class="empty-state">Nenhum registro</p>';
            } else {
                const acoes = await this.db.getAll('acoes');
                acoesUsuario.forEach(h => {
                    const acao = acoes.find(a => a.id === h.acao_id);
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    const pointsClass = h.pontos_ganhos_perdidos >= 0 ? 'positive' : 'negative';
                    item.innerHTML = `
                        <div>
                            <div class="list-item-name">${acao ? acao.descricao : '(removida)'}</div>
                            <div class="history-date">${new Date(h.data).toLocaleString('pt-BR')}</div>
                        </div>
                        <div class="history-points ${pointsClass}">${h.pontos_ganhos_perdidos >= 0 ? '+' : ''}${h.pontos_ganhos_perdidos}</div>
                    `;
                    acoesList.appendChild(item);
                });
            }

            const historicoCompras = await this.db.getAll('historico_compras');
            const comprasUsuario = historicoCompras
                .filter(h => h.usuario_id === this.currentUser.id)
                .sort((a, b) => new Date(b.data) - new Date(a.data))
                .slice(0, 20);
            
            const comprasList = document.getElementById('historicoCompras');
            comprasList.innerHTML = '';
            if (comprasUsuario.length === 0) {
                comprasList.innerHTML = '<p class="empty-state">Nenhum registro</p>';
            } else {
                const recompensas = await this.db.getAll('recompensas');
                comprasUsuario.forEach(h => {
                    const r = recompensas.find(x => x.id === h.recompensa_id);
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    item.innerHTML = `
                        <div>
                            <div class="list-item-name">${r ? r.nome : '(removida)'}</div>
                            <div class="history-date">${new Date(h.data).toLocaleString('pt-BR')}</div>
                        </div>
                        <div class="history-points negative">-${h.pontos_gastos}</div>
                    `;
                    comprasList.appendChild(item);
                });
            }
        } catch (error) {
            console.error('Erro:', error);
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // FORMULÁRIOS
    // ============================================================
    setupAdminForms() {
        document.getElementById('formUsuario').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('usuarioNome').value.trim();
            if (nome) {
                this.showLoading(true);
                try {
                    await this.db.add('usuarios', { nome, pontos_totais: 0 });
                    document.getElementById('usuarioNome').value = '';
                    await this.loadUsuarios();
                    this.showModal('Adicionado', `Usuário "${nome}" criado.`);
                } catch (error) {
                    this.showModal('Erro', 'Não foi possível adicionar.');
                } finally {
                    this.showLoading(false);
                }
            }
        });

        document.getElementById('formRecompensa').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('recompensaNome').value.trim();
            const custo = parseInt(document.getElementById('recompensaCusto').value);
            const tempo = parseInt(document.getElementById('recompensaTempo').value) || 0;
            const imagem = document.getElementById('recompensaImagem').value.trim();
            if (nome && custo) {
                this.showLoading(true);
                try {
                    await this.db.add('recompensas', {
                        nome, custo_pontos: custo, tempo_minutos: tempo, imagem_url: imagem || null
                    });
                    document.getElementById('formRecompensa').reset();
                    document.getElementById('recompensaTempo').value = '0';
                    await this.loadRecompensas();
                    this.showModal('Adicionada', `Recompensa "${nome}" criada.`);
                } catch (error) {
                    this.showModal('Erro', 'Não foi possível adicionar.');
                } finally {
                    this.showLoading(false);
                }
            }
        });

        document.getElementById('formAcao').addEventListener('submit', async (e) => {
            e.preventDefault();
            const descricao = document.getElementById('acaoDescricao').value.trim();
            const valor = parseInt(document.getElementById('acaoValor').value);
            if (descricao && !isNaN(valor)) {
                this.showLoading(true);
                try {
                    await this.db.add('acoes', { descricao, valor_pontos: valor });
                    document.getElementById('formAcao').reset();
                    await this.loadAcoes();
                    this.showModal('Adicionada', `Ação "${descricao}" criada.`);
                } catch (error) {
                    this.showModal('Erro', 'Não foi possível adicionar.');
                } finally {
                    this.showLoading(false);
                }
            }
        });
    }

    // ============================================================
    // EXCLUSÃO
    // ============================================================
    async deleteUsuario(id) {
        if (!confirm('Excluir usuário? Tudo será apagado.')) return;
        this.showLoading(true);
        try {
            await this.db.delete('usuarios', id);
            await this.loadUsuarios();
            if (this.currentUser && this.currentUser.id === id) {
                this.currentUser = null;
                document.getElementById('selectUser').value = '';
                document.getElementById('totalPoints').textContent = '0';
            }
        } catch (error) {
            this.showModal('Erro', 'Não foi possível excluir.');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteAcao(id) {
        if (!confirm('Excluir ação?')) return;
        this.showLoading(true);
        try {
            await this.db.delete('acoes', id);
            await this.loadAcoes();
        } catch (error) {
            this.showModal('Erro', 'Não foi possível excluir.');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteRecompensa(id) {
        if (!confirm('Excluir recompensa?')) return;
        this.showLoading(true);
        try {
            await this.db.delete('recompensas', id);
            await this.loadRecompensas();
        } catch (error) {
            this.showModal('Erro', 'Não foi possível excluir.');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // MODAL
    // ============================================================
    showModal(title, message) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('modal').classList.add('active');
    }

    hideModal() {
        document.getElementById('modal').classList.remove('active');
    }
}

const app = new LojaDePontos();
