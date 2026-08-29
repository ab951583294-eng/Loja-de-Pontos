// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// ============================================================
const SUPABASE_URL = 'https://yvpmptaczeitafibnawh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2cG1wdGFjemVpdGFmaWJuYXdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgwMTM3NTUsImV4cCI6MjEwMzU4OTc1NX0.WIjjlyZw6qDX8et7DQgm3ddPQ8YrY57MDSRk-FKNVZ0';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// CONFIGURAÇÕES DO SISTEMA
// ============================================================
const CONFIG = {
    PERCENTUAL_MINIMO_STREAK: 50,
    MARCO_STREAK_BONUS: 15,
    PERCENTUAL_RECOMPENSA_ALEATORIA: 100,
    XP_POR_META: 10,
    XP_POR_DIA_COMPLETO: 50
};

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
        this.isLocked = false;
        this.lockCode = null;
        this.metasDoDia = [];
        this.diaEncerrado = false;
        this.diaPendente = null;
        this.streakAtual = 0;
        this.maiorStreak = 0;
        this.nivelAtual = 1;
        this.xpAtual = 0;
        this.xpParaProximo = 100;
        this.xpNecessarioProximoNivel = 100;
        this.calendarioDataAtual = new Date();
        this.historicoDiasMap = {};
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners();
            this.checkLockStatus();
            this.showLoading(true);
            await Promise.all([
                this.loadUsuarios(),
                this.loadAcoes(),
                this.loadRecompensas(),
                this.loadMetasTemplates()
            ]);
            this.setupAdminForms();
            this.applyLockUI();
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
        document.getElementById('btnLock').addEventListener('click', () => this.handleLockClick());
        document.getElementById('selectUser').addEventListener('change', (e) => this.selectUser(e.target.value));
        
        document.querySelectorAll('.main-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMainTab(e.target.dataset.tab);
                if (e.target.dataset.tab === 'calendario') {
                    this.carregarCalendario();
                }
            });
        });
        
        document.querySelector('#modal .modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('modalBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') this.hideModal();
        });
    }

    // ============================================================
    // SISTEMA DE BLOQUEIO
    // ============================================================
    checkLockStatus() {
        const lockData = localStorage.getItem('lojaDePontos_lock');
        if (lockData) {
            try {
                const parsed = JSON.parse(lockData);
                this.isLocked = true;
                this.lockCode = parsed.code;
            } catch (e) {
                localStorage.removeItem('lojaDePontos_lock');
            }
        }
    }

    handleLockClick() {
        if (this.isLocked) {
            this.showUnlockFlow();
        } else {
            this.showLockFlow();
        }
    }

    showLockFlow() {
        const modal = document.getElementById('lockModal');
        const body = document.getElementById('lockModalBody');
        const newCode = this.generateRandomCode(32);
        
        body.innerHTML = `
            <h3>🔒 Bloquear Sistema</h3>
            <p>Ao bloquear, você não poderá mais editar recompensas, ações, usuários ou metas. Apenas operações de uso continuarão disponíveis.</p>
            <div class="lock-warning">
                ️ <strong>Guarde este código!</strong> Ele será necessário para desbloquear. O código muda a cada bloqueio.
            </div>
            <div class="lock-code-display">${newCode}</div>
            <div class="lock-actions">
                <button class="btn btn-secondary" onclick="app.closeLockModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="app.confirmLock()">Confirmar Bloqueio</button>
            </div>
        `;
        
        this._pendingLockCode = newCode;
        modal.classList.add('active');
    }

    confirmLock() {
        this.lockCode = this._pendingLockCode;
        this._pendingLockCode = null;
        this.isLocked = true;
        localStorage.setItem('lojaDePontos_lock', JSON.stringify({ code: this.lockCode }));
        this.closeLockModal();
        this.applyLockUI();
        this.showModal('Sistema Bloqueado', 'O sistema foi bloqueado. Anote o código em um local seguro!');
    }

    showUnlockFlow() {
        const modal = document.getElementById('lockModal');
        const body = document.getElementById('lockModalBody');
        
        body.innerHTML = `
            <h3>🔓 Desbloquear Sistema</h3>
            <p>Digite o código abaixo para desbloquear:</p>
            <div class="lock-code-display">${this.lockCode}</div>
            <div class="lock-warning">
                📝 Digite o código exatamente como aparece acima. Copiar e colar está desabilitado.
            </div>
            <input type="text" id="unlockCodeInput" class="lock-input" placeholder="Digite o código aqui..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
            <div class="lock-actions">
                <button class="btn btn-secondary" onclick="app.closeLockModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="app.confirmUnlock()">Desbloquear</button>
            </div>
        `;
        
        modal.classList.add('active');
        
        setTimeout(() => {
            this.setupAntiCopyPaste();
            const input = document.getElementById('unlockCodeInput');
            if (input) input.focus();
        }, 100);
    }

    setupAntiCopyPaste() {
        const input = document.getElementById('unlockCodeInput');
        if (!input) return;
        
        input.addEventListener('paste', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
        input.addEventListener('copy', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
        input.addEventListener('cut', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
        input.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
        input.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
        input.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); return false; });
        
        document.addEventListener('paste', this._globalPasteHandler);
        document.addEventListener('copy', this._globalCopyHandler);
    }

    removeAntiCopyPaste() {
        document.removeEventListener('paste', this._globalPasteHandler);
        document.removeEventListener('copy', this._globalCopyHandler);
    }

    confirmUnlock() {
        const input = document.getElementById('unlockCodeInput');
        if (!input) return;
        const code = input.value.trim();
        
        if (!code) {
            this.showModal('Código vazio', 'Digite o código para desbloquear.');
            return;
        }
        
        if (code === this.lockCode) {
            this.isLocked = false;
            this.lockCode = null;
            localStorage.removeItem('lojaDePontos_lock');
            this.closeLockModal();
            this.applyLockUI();
            this.showModal('Sistema Desbloqueado', 'O sistema foi desbloqueado com sucesso!');
        } else {
            this.showModal('Código Incorreto', 'O código digitado não corresponde. Tente novamente.');
            input.value = '';
            input.focus();
        }
    }

    closeLockModal() {
        document.getElementById('lockModal').classList.remove('active');
        this.removeAntiCopyPaste();
        this._pendingLockCode = null;
    }

    applyLockUI() {
        const lockBtn = document.getElementById('btnLock');
        const adminBanner = document.getElementById('adminLockBanner');
        const adminForms = document.querySelectorAll('#adminGrid .form');
        const deleteButtons = document.querySelectorAll('.btn-danger');
        
        if (this.isLocked) {
            lockBtn.textContent = 'BLOQ';
            lockBtn.classList.add('is-locked');
            if (adminBanner) adminBanner.style.display = 'block';
            adminForms.forEach(form => { form.style.display = 'none'; });
            deleteButtons.forEach(btn => { btn.style.display = 'none'; });
        } else {
            lockBtn.textContent = 'LIVRE';
            lockBtn.classList.remove('is-locked');
            if (adminBanner) adminBanner.style.display = 'none';
            adminForms.forEach(form => { form.style.display = 'flex'; });
            deleteButtons.forEach(btn => { btn.style.display = 'inline-block'; });
        }
    }

    generateRandomCode(length) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let code = '';
        const array = new Uint32Array(length);
        crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            code += chars.charAt(array[i] % chars.length);
        }
        return code;
    }

    // ============================================================
    // NAVEGAÇÃO
    // ============================================================
    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn:not(.lock-btn)').forEach(b => b.classList.remove('active'));
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
        if (tab === 'metas' && this.currentUser) {
            this.carregarMetasDoDia();
        }
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
        
        const selectedUserId = this.currentUser ? this.currentUser.id : select.value;
        
        select.innerHTML = '<option value="">-- Selecione --</option>';
        usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.pontos_totais} pts)`;
            select.appendChild(option);
        });
        
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
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        <button class="btn btn-secondary" onclick="app.zerarPontos(${usuario.id})" title="Zerar pontos">↺</button>
                        <button class="btn btn-secondary" onclick="app.zerarHistorico(${usuario.id})" title="Limpar histórico"></button>
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
            document.getElementById('comprasAtivasList').innerHTML = '<p class="empty-state">Selecione um usuário</p>';
            document.getElementById('metasDiaContent').innerHTML = '<p class="empty-state">Selecione um usuário para ver as metas</p>';
            document.getElementById('diaPendenteBanner').style.display = 'none';
            this.streakAtual = 0;
            this.maiorStreak = 0;
            this.nivelAtual = 1;
            this.xpAtual = 0;
            this.atualizarStreakDisplay();
            return;
        }
        this.currentUser = await this.db.get('usuarios', parseInt(userId));
        this.updatePointsDisplay();
        await this.loadHistorico();
        await this.loadRecompensas();
        await this.loadComprasAtivas();
        await this.carregarStreak();
        await this.verificarDiaPendente();
        
        const metasTab = document.querySelector('.main-tabs [data-tab="metas"]');
        if (metasTab && metasTab.classList.contains('active')) {
            this.carregarMetasDoDia();
        }
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
    // METAS DO DIA + STREAK + XP
    // ============================================================
    async loadMetasTemplates() {
        const metas = await this.db.getAll('metas');
        const adminMetasList = document.getElementById('adminMetasList');
        
        adminMetasList.innerHTML = '';
        if (metas.length === 0) {
            adminMetasList.innerHTML = '<p class="empty-state">Nenhuma meta cadastrada</p>';
            return;
        }

        metas.forEach(meta => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${meta.descricao}</div>
                </div>
                <button class="btn btn-danger" onclick="app.deleteMeta(${meta.id})">Excluir</button>
            `;
            adminMetasList.appendChild(item);
        });
    }

    async carregarStreak() {
        if (!this.currentUser) {
            this.streakAtual = 0;
            this.maiorStreak = 0;
            this.nivelAtual = 1;
            this.xpAtual = 0;
            this.atualizarStreakDisplay();
            return;
        }

        try {
            const historico = await this.db.query('historico_dias', { usuario_id: this.currentUser.id });
            
            if (historico.length === 0) {
                this.streakAtual = 0;
                this.maiorStreak = this.currentUser.maior_streak || 0;
            } else {
                historico.sort((a, b) => new Date(b.data) - new Date(a.data));
                const ultimoDia = historico[0];
                this.streakAtual = ultimoDia.streak_atual || 0;
                this.maiorStreak = Math.max(this.streakAtual, this.currentUser.maior_streak || 0);
            }
            
            await this.carregarXP();
            this.atualizarStreakDisplay();
        } catch (error) {
            console.error('Erro ao carregar streak:', error);
            this.streakAtual = 0;
            this.maiorStreak = this.currentUser.maior_streak || 0;
            this.atualizarStreakDisplay();
        }
    }

    async carregarXP() {
        try {
            const historico = await this.db.query('historico_dias', { usuario_id: this.currentUser.id });
            const totalXP = historico.reduce((sum, dia) => sum + (dia.xp_ganho || 0), 0);
            
            this.xpAtual = totalXP;
            
            const niveis = await this.db.getAll('niveis_xp');
            niveis.sort((a, b) => a.nivel - b.nivel);
            
            let nivel = 1;
            let xpParaProximo = niveis.length > 1 ? niveis[1].xp_necessario : 100;
            let xpNecessarioProximo = niveis.length > 1 ? niveis[1].xp_necessario : 100;
            
            for (let i = niveis.length - 1; i >= 0; i--) {
                if (totalXP >= niveis[i].xp_necessario) {
                    nivel = niveis[i].nivel;
                    if (i < niveis.length - 1) {
                        xpParaProximo = niveis[i + 1].xp_necessario - totalXP;
                        xpNecessarioProximo = niveis[i + 1].xp_necessario;
                    } else {
                        xpParaProximo = 0;
                        xpNecessarioProximo = totalXP + 100;
                    }
                    break;
                }
            }
            
            this.nivelAtual = nivel;
            this.xpParaProximo = xpParaProximo;
            this.xpNecessarioProximoNivel = xpNecessarioProximo;
            
        } catch (error) {
            console.error('Erro ao carregar XP:', error);
            this.xpAtual = 0;
            this.nivelAtual = 1;
        }
    }

    atualizarStreakDisplay() {
        document.getElementById('streakAtual').textContent = this.streakAtual;
        document.getElementById('maiorStreak').textContent = this.maiorStreak;
        document.getElementById('nivelAtual').textContent = this.nivelAtual;
        
        const xpMinNivel = this.xpNecessarioProximoNivel - this.xpParaProximo;
        const xpNoNivel = this.xpAtual - xpMinNivel;
        const xpTotalNivel = this.xpParaProximo;
        const percentualXP = xpTotalNivel > 0 ? Math.min(100, Math.round((xpNoNivel / xpTotalNivel) * 100)) : 0;
        
        document.getElementById('xpBar').style.width = `${percentualXP}%`;
        document.getElementById('xpProgress').textContent = `${this.xpAtual} XP • Faltam ${this.xpParaProximo} XP para o nível ${this.nivelAtual + 1}`;
    }

    async zerarStreak() {
        if (!this.currentUser) {
            this.showModal('Atenção', 'Selecione um usuário.');
            return;
        }
        
        if (!confirm('Zerar a sequência atual? Esta ação não pode ser desfeita.')) return;
        
        this.showLoading(true);
        try {
            if (this.streakAtual > (this.currentUser.maior_streak || 0)) {
                await this.db.update('usuarios', {
                    id: this.currentUser.id,
                    maior_streak: this.streakAtual
                });
            }
            
            const historico = await this.db.query('historico_dias', { usuario_id: this.currentUser.id });
            if (historico.length > 0) {
                historico.sort((a, b) => new Date(b.data) - new Date(a.data));
                const ultimoDia = historico[0];
                await this.db.update('historico_dias', {
                    id: ultimoDia.id,
                    streak_atual: 0
                });
            }
            
            this.streakAtual = 0;
            this.atualizarStreakDisplay();
            
            this.showModal('Streak zerado', 'A sequência foi resetada para 0.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível zerar o streak.');
        } finally {
            this.showLoading(false);
        }
    }

    async verificarDiaPendente() {
        if (!this.currentUser) return;
        
        try {
            const hoje = this.getDataHoje();
            const ontem = this.getDataOntem();
            
            const historicoHoje = await this.db.query('historico_dias', { 
                usuario_id: this.currentUser.id, 
                data: hoje 
            });
            
            if (historicoHoje.length > 0) {
                this.diaEncerrado = true;
                this.diaPendente = null;
                document.getElementById('diaPendenteBanner').style.display = 'none';
                return;
            }
            
            const historicoOntem = await this.db.query('historico_dias', { 
                usuario_id: this.currentUser.id, 
                data: ontem 
            });
            
            if (historicoOntem.length === 0) {
                this.diaPendente = ontem;
                document.getElementById('diaPendenteBanner').style.display = 'block';
            } else {
                this.diaPendente = null;
                document.getElementById('diaPendenteBanner').style.display = 'none';
            }
            
            this.diaEncerrado = false;
        } catch (error) {
            console.error('Erro ao verificar dia pendente:', error);
        }
    }

    async pularDiaPendente() {
        if (!confirm('Pular o dia pendente? Seu streak será resetado para 0.')) return;
        
        this.showLoading(true);
        try {
            await this.db.add('historico_dias', {
                usuario_id: this.currentUser.id,
                data: this.diaPendente,
                metas_concluidas: 0,
                metas_total: 0,
                pontos_ganhos: 0,
                percentual_conclusao: 0,
                xp_ganho: 0,
                nivel: this.nivelAtual,
                streak_atual: 0
            });
            
            this.streakAtual = 0;
            this.atualizarStreakDisplay();
            this.diaPendente = null;
            document.getElementById('diaPendenteBanner').style.display = 'none';
            
            this.showModal('Dia pulado', 'O dia foi pulado e o streak foi resetado.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível pular o dia.');
        } finally {
            this.showLoading(false);
        }
    }

    irParaDiaPendente() {
        this.carregarMetasDoDia(this.diaPendente);
    }

    getDataHoje() {
        const hoje = new Date();
        return hoje.toISOString().split('T')[0];
    }

    getDataOntem() {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        return ontem.toISOString().split('T')[0];
    }

    async carregarMetasDoDia(dataEspecifica = null) {
        if (!this.currentUser) {
            document.getElementById('metasDiaContent').innerHTML = '<p class="empty-state">Selecione um usuário</p>';
            return;
        }

        this.showLoading(true);
        try {
            const dataAlvo = dataEspecifica || this.getDataHoje();
            const ehDiaPendente = dataEspecifica !== null;
            
            const historico = await this.db.query('historico_dias', { 
                usuario_id: this.currentUser.id, 
                data: dataAlvo 
            });
            
            if (historico.length > 0) {
                this.mostrarResultadoDia(historico[0]);
                this.showLoading(false);
                return;
            }
            
            let metasDoDia = await this.db.query('metas_do_dia', { 
                usuario_id: this.currentUser.id, 
                data: dataAlvo 
            });
            
            if (metasDoDia.length === 0) {
                const templates = await this.db.query('metas', { ativa: true });
                
                for (const template of templates) {
                    await this.db.add('metas_do_dia', {
                        usuario_id: this.currentUser.id,
                        meta_id: template.id,
                        data: dataAlvo,
                        concluida: false
                    });
                }
                
                metasDoDia = await this.db.query('metas_do_dia', { 
                    usuario_id: this.currentUser.id, 
                    data: dataAlvo 
                });
            }
            
            this.metasDoDia = metasDoDia;
            this.mostrarMetasDoDia(metasDoDia, dataAlvo, ehDiaPendente);
        } catch (error) {
            console.error('Erro:', error);
            document.getElementById('metasDiaContent').innerHTML = '<p class="empty-state">Erro ao carregar metas</p>';
        } finally {
            this.showLoading(false);
        }
    }

    mostrarMetasDoDia(metas, data, ehDiaPendente) {
        const container = document.getElementById('metasDiaContent');
        const concluidas = metas.filter(m => m.concluida).length;
        const total = metas.length;
        const percentual = total > 0 ? Math.round((concluidas / total) * 100) : 0;
        const valorPorMeta = total > 0 ? Math.round(100 / total) : 0;
        
        const dataFormatada = this.formatarData(data);
        const titulo = ehDiaPendente ? `Metas do dia ${dataFormatada} (pendente)` : `Metas de hoje`;
        
        let html = `
            <div class="section">
                <div class="metas-header">
                    <h2>${titulo}</h2>
                    <div class="metas-progress">${concluidas}/${total} metas • ${valorPorMeta}% cada</div>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${percentual}%"></div>
                </div>
        `;
        
        if (total === 0) {
            html += `<p class="empty-state">Nenhuma meta cadastrada. Adicione metas em Administração.</p>`;
        } else {
            const templates = this._metaTemplates || [];
            metas.forEach(meta => {
                const metaTemplate = templates.find(t => t.id === meta.meta_id);
                const descricao = metaTemplate ? metaTemplate.descricao : 'Meta removida';
                
                html += `
                    <div class="meta-item ${meta.concluida ? 'concluida' : ''}" onclick="app.toggleMeta(${meta.id})">
                        <div class="meta-checkbox">${meta.concluida ? '✓' : ''}</div>
                        <div class="meta-descricao">${descricao}</div>
                        <div class="meta-pontos">+${valorPorMeta}%</div>
                    </div>
                `;
            });
            
            html += `
                <button class="btn btn-primary encerrar-dia-btn" onclick="app.encerrarDia('${data}')">
                    ${ehDiaPendente ? 'Encerrar dia pendente' : 'Encerrar dia'}
                </button>
            `;
        }
        
        html += `</div>`;
        html += `<div id="historicoDiasContainer" class="historico-dias-list"></div>`;
        
        container.innerHTML = html;
        
        this.carregarHistoricoDias();
    }

    async toggleMeta(metaId) {
        this.showLoading(true);
        try {
            const meta = this.metasDoDia.find(m => m.id === metaId);
            if (!meta) return;
            
            meta.concluida = !meta.concluida;
            await this.db.update('metas_do_dia', {
                id: metaId,
                concluida: meta.concluida
            });
            
            await this.carregarMetasDoDia(meta.data);
        } catch (error) {
            this.showModal('Erro', 'Não foi possível atualizar a meta.');
        } finally {
            this.showLoading(false);
        }
    }

    async encerrarDia(data) {
        if (!confirm('Encerrar o dia? Esta ação não pode ser desfeita.')) return;
        
        this.showLoading(true);
        try {
            const metas = await this.db.query('metas_do_dia', { 
                usuario_id: this.currentUser.id, 
                data: data 
            });
            
            const concluidas = metas.filter(m => m.concluida).length;
            const total = metas.length;
            const percentual = total > 0 ? Math.round((concluidas / total) * 100) : 0;
            
            // Calcular XP
            const xpMetas = concluidas * CONFIG.XP_POR_META;
            const xpBonus = percentual >= 100 ? CONFIG.XP_POR_DIA_COMPLETO : 0;
            const xpTotal = xpMetas + xpBonus;
            
            // Calcular novo streak
            let novoStreak = this.streakAtual;
            if (percentual >= CONFIG.PERCENTUAL_MINIMO_STREAK) {
                novoStreak = this.streakAtual + 1;
            } else {
                novoStreak = 0;
            }
            
            const novoMaiorStreak = Math.max(novoStreak, this.maiorStreak);
            
            // Bônus de marco de streak
            let recompensaBonusId = null;
            let recompensaBonusNome = null;
            let mensagemBonus = null;
            
            if (novoStreak > 0 && novoStreak % CONFIG.MARCO_STREAK_BONUS === 0) {
                const recompensasDisponiveis = await this.db.query('recompensas', { tempo_minutos: 0 });
                if (recompensasDisponiveis.length > 0) {
                    const sorteada = recompensasDisponiveis[Math.floor(Math.random() * recompensasDisponiveis.length)];
                    recompensaBonusId = sorteada.id;
                    recompensaBonusNome = sorteada.nome;
                    mensagemBonus = `🏆 Marco de ${CONFIG.MARCO_STREAK_BONUS} dias! Recompensa: ${sorteada.nome}`;
                    
                    await this.db.add('recompensas_ativas', {
                        usuario_id: this.currentUser.id,
                        recompensa_id: sorteada.id,
                        data_inicio: null,
                        data_fim: null,
                        tempo_restante_segundos: 0,
                        pausada: true,
                        concluida: false
                    });
                }
            }
            
            // Recompensa aleatória por 100%
            let recompensaAleatoria = null;
            if (percentual >= CONFIG.PERCENTUAL_RECOMPENSA_ALEATORIA && total > 0) {
                const recompensasDisponiveis = await this.db.query('recompensas', { tempo_minutos: 0 });
                if (recompensasDisponiveis.length > 0) {
                    const sorteada = recompensasDisponiveis[Math.floor(Math.random() * recompensasDisponiveis.length)];
                    recompensaAleatoria = sorteada;
                    
                    await this.db.add('recompensas_ativas', {
                        usuario_id: this.currentUser.id,
                        recompensa_id: sorteada.id,
                        data_inicio: null,
                        data_fim: null,
                        tempo_restante_segundos: 0,
                        pausada: true,
                        concluida: false
                    });
                }
            }
            
            await this.db.add('historico_dias', {
                usuario_id: this.currentUser.id,
                data: data,
                metas_concluidas: concluidas,
                metas_total: total,
                pontos_ganhos: 0,
                percentual_conclusao: percentual,
                xp_ganho: xpTotal,
                nivel: this.nivelAtual,
                streak_atual: novoStreak,
                recompensa_bonus_id: recompensaBonusId,
                recompensa_bonus_nome: recompensaBonusNome
            });
            
            await this.db.update('usuarios', {
                id: this.currentUser.id,
                maior_streak: novoMaiorStreak
            });
            
            this.streakAtual = novoStreak;
            this.maiorStreak = novoMaiorStreak;
            this.xpAtual += xpTotal;
            
            await this.carregarXP();
            this.atualizarStreakDisplay();
            this.diaPendente = null;
            document.getElementById('diaPendenteBanner').style.display = 'none';
            
            this.mostrarResultadoDia({
                data: data,
                metas_concluidas: concluidas,
                metas_total: total,
                percentual_conclusao: percentual,
                xp_ganho: xpTotal,
                streak_atual: novoStreak,
                recompensa_bonus_nome: recompensaBonusNome
            }, recompensaAleatoria, mensagemBonus);
            
            await this.loadComprasAtivas();
            
        } catch (error) {
            console.error('Erro:', error);
            this.showModal('Erro', 'Não foi possível encerrar o dia.');
        } finally {
            this.showLoading(false);
        }
    }

    mostrarResultadoDia(resultado, recompensaAleatoria = null, mensagemBonus = null) {
        const container = document.getElementById('metasDiaContent');
        const dataFormatada = this.formatarData(resultado.data);
        
        let html = `
            <div class="dia-resultado">
                <h3>📊 Dia ${dataFormatada} encerrado</h3>
                <div class="dia-resultado-stats">
                    <div class="stat-box">
                        <div class="stat-value">${resultado.metas_concluidas}/${resultado.metas_total}</div>
                        <div class="stat-label">Metas</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${resultado.percentual_conclusao}%</div>
                        <div class="stat-label">Concluído</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">+${resultado.xp_ganho}</div>
                        <div class="stat-label">XP Ganho</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">🔥 ${resultado.streak_atual}</div>
                        <div class="stat-label">Streak</div>
                    </div>
                </div>
        `;
        
        if (recompensaAleatoria) {
            html += `
                <div class="dia-resultado-bonus">
                    <h4>🎁 Dia perfeito! Recompensa aleatória:</h4>
                    <p>${recompensaAleatoria.nome}</p>
                </div>
            `;
        }
        
        if (mensagemBonus) {
            html += `
                <div class="dia-resultado-bonus">
                    <h4>${mensagemBonus}</h4>
                </div>
            `;
        }
        
        html += `</div>`;
        html += `<div id="historicoDiasContainer" class="historico-dias-list"></div>`;
        
        container.innerHTML = html;
        this.carregarHistoricoDias();
    }

    async carregarHistoricoDias() {
        if (!this.currentUser) return;
        
        try {
            const historico = await this.db.query('historico_dias', { usuario_id: this.currentUser.id });
            historico.sort((a, b) => new Date(b.data) - new Date(a.data));
            const recentes = historico.slice(0, 7);
            
            const container = document.getElementById('historicoDiasContainer');
            if (!container) return;
            
            if (recentes.length === 0) {
                container.innerHTML = '<p class="empty-state">Nenhum dia encerrado ainda</p>';
                return;
            }
            
            let html = '<h3 style="margin-bottom: 12px; font-size: 0.95rem;">Últimos 7 dias</h3>';
            recentes.forEach(dia => {
                const dataFormatada = this.formatarData(dia.data);
                
                html += `
                    <div class="historico-dias-item">
                        <div class="historico-dias-data">${dataFormatada}</div>
                        <div class="historico-dias-info">
                            ${dia.metas_concluidas}/${dia.metas_total} metas • ${dia.percentual_conclusao}% • +${dia.xp_ganho} XP • 🔥 ${dia.streak_atual}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        } catch (error) {
            console.error('Erro ao carregar histórico de dias:', error);
        }
    }

    formatarData(dataStr) {
        const [ano, mes, dia] = dataStr.split('-');
        return `${dia}/${mes}`;
    }

    // ============================================================
    // CALENDÁRIO
    // ============================================================
    async carregarCalendario() {
        if (!this.currentUser) {
            document.getElementById('calendarioGrid').innerHTML = '<p class="empty-state" style="grid-column: 1/-1;">Selecione um usuário</p>';
            return;
        }

        this.showLoading(true);
        try {
            const historico = await this.db.query('historico_dias', { usuario_id: this.currentUser.id });
            this.historicoDiasMap = {};
            historico.forEach(dia => {
                this.historicoDiasMap[dia.data] = dia;
            });

            this.renderizarCalendario();
        } catch (error) {
            console.error('Erro ao carregar calendário:', error);
            document.getElementById('calendarioGrid').innerHTML = '<p class="empty-state" style="grid-column: 1/-1;">Erro ao carregar</p>';
        } finally {
            this.showLoading(false);
        }
    }

    renderizarCalendario() {
        const ano = this.calendarioDataAtual.getFullYear();
        const mes = this.calendarioDataAtual.getMonth();
        
        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        document.getElementById('calendarioMesAno').textContent = `${meses[mes]} ${ano}`;
        
        const primeiroDia = new Date(ano, mes, 1);
        const ultimoDia = new Date(ano, mes + 1, 0);
        const diaSemanaInicio = primeiroDia.getDay();
        const totalDias = ultimoDia.getDate();
        
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        
        let html = '';
        
        diasSemana.forEach(dia => {
            html += `<div class="calendario-dia-semana">${dia}</div>`;
        });
        
        for (let i = 0; i < diaSemanaInicio; i++) {
            html += `<div class="calendario-dia vazio"></div>`;
        }
        
        const hoje = new Date();
        for (let dia = 1; dia <= totalDias; dia++) {
            const dataStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const dataAtual = new Date(ano, mes, dia);
            const ehHoje = dataAtual.toDateString() === hoje.toDateString();
            const ehPassado = dataAtual < hoje;
            const ehFuturo = dataAtual > hoje;
            
            const diaInfo = this.historicoDiasMap[dataStr];
            
            let classe = 'calendario-dia';
            let info = '';
            let percentual = '';
            
            if (ehHoje) {
                classe += ' hoje';
            }
            
            if (diaInfo) {
                classe += ' encerrado';
                info = `${diaInfo.metas_concluidas}/${diaInfo.metas_total}`;
                percentual = `${diaInfo.percentual_conclusao}%`;
            } else if (ehPassado) {
                classe += ' pendente';
                info = 'Não encerrado';
            } else {
                info = 'Futuro';
            }
            
            html += `
                <div class="${classe}" onclick="${diaInfo || ehPassado ? `app.clicarDia('${dataStr}')` : ''}">
                    <div class="calendario-dia-numero">${dia}</div>
                    ${info ? `<div class="calendario-dia-info">${info}</div>` : ''}
                    ${percentual ? `<div class="calendario-dia-percentual">${percentual}</div>` : ''}
                </div>
            `;
        }
        
        document.getElementById('calendarioGrid').innerHTML = html;
    }

    mudarMes(direcao) {
        this.calendarioDataAtual.setMonth(this.calendarioDataAtual.getMonth() + direcao);
        this.renderizarCalendario();
    }

    async clicarDia(dataStr) {
        const acao = prompt(`Dia ${this.formatarData(dataStr)}\n\nDigite:\n• "reiniciar" para apagar e refazer\n• "visualizar" para apenas ver`);
        
        if (acao === 'reiniciar' || acao === 'REINICIAR') {
            await this.reiniciarDia(dataStr);
        } else if (acao === 'visualizar' || acao === 'VISUALIZAR' || acao === '') {
            await this.visualizarDia(dataStr);
        }
    }

    async reiniciarDia(dataStr) {
        if (!confirm(`⚠️ ATENÇÃO: Isso apagará TODOS os dados do dia ${this.formatarData(dataStr)}\n\nDeseja continuar?`)) return;
        
        this.showLoading(true);
        try {
            const metas = await this.db.query('metas_do_dia', { 
                usuario_id: this.currentUser.id, 
                data: dataStr 
            });
            for (const meta of metas) {
                await this.db.delete('metas_do_dia', meta.id);
            }
            
            const historico = await this.db.query('historico_dias', { 
                usuario_id: this.currentUser.id, 
                data: dataStr 
            });
            for (const dia of historico) {
                await this.db.delete('historico_dias', dia.id);
            }
            
            await this.carregarCalendario();
            await this.carregarStreak();
            
            this.showModal('Dia reiniciado', `O dia ${this.formatarData(dataStr)} foi reiniciado.`);
        } catch (error) {
            console.error('Erro:', error);
            this.showModal('Erro', 'Não foi possível reiniciar o dia.');
        } finally {
            this.showLoading(false);
        }
    }

    async visualizarDia(dataStr) {
        const diaInfo = this.historicoDiasMap[dataStr];
        if (!diaInfo) {
            this.showModal('Dia não encontrado', 'Não há dados para este dia.');
            return;
        }
        
        const mensagem = ` Dia ${this.formatarData(dataStr)}\n\n` +
            `✅ Metas: ${diaInfo.metas_concluidas}/${diaInfo.metas_total}\n` +
            `📈 Conclusão: ${diaInfo.percentual_conclusao}%\n` +
            `⭐ XP Ganho: ${diaInfo.xp_ganho}\n` +
            `🔥 Streak: ${diaInfo.streak_atual}\n` +
            `${diaInfo.recompensa_bonus_nome ? `🎁 Bônus: ${diaInfo.recompensa_bonus_nome}\n` : ''}`;
        
        this.showModal('Dados do Dia', mensagem);
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
        if (!confirm('Apagar TODO o histórico? Isso inclui ações, compras, tickets, metas e streaks.')) return;
        this.showLoading(true);
        try {
            const ha = await this.db.query('historico_acoes', { usuario_id: usuarioId });
            for (const h of ha) await this.db.delete('historico_acoes', h.id);
            const hc = await this.db.query('historico_compras', { usuario_id: usuarioId });
            for (const h of hc) await this.db.delete('historico_compras', h.id);
            const ra = await this.db.query('recompensas_ativas', { usuario_id: usuarioId });
            for (const r of ra) await this.db.delete('recompensas_ativas', r.id);
            const hd = await this.db.query('historico_dias', { usuario_id: usuarioId });
            for (const h of hd) await this.db.delete('historico_dias', h.id);
            const md = await this.db.query('metas_do_dia', { usuario_id: usuarioId });
            for (const m of md) await this.db.delete('metas_do_dia', m.id);
            
            await this.db.update('usuarios', { id: usuarioId, maior_streak: 0 });
            
            await this.loadHistorico();
            await this.loadComprasAtivas();
            await this.carregarStreak();
            
            this.showModal('Zerado', 'Histórico completo apagado.');
        } catch (error) {
            this.showModal('Erro', 'Não foi possível zerar.');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // HISTÓRICO DE AÇÕES
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
            if (this.isLocked) {
                this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para adicionar usuários.');
                return;
            }
            const nome = document.getElementById('usuarioNome').value.trim();
            if (nome) {
                this.showLoading(true);
                try {
                    await this.db.add('usuarios', { nome, pontos_totais: 0, maior_streak: 0 });
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
            if (this.isLocked) {
                this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para adicionar recompensas.');
                return;
            }
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
            if (this.isLocked) {
                this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para adicionar ações.');
                return;
            }
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

        document.getElementById('formMeta').addEventListener('submit', async (e) => {
            e.preventDefault();
            if (this.isLocked) {
                this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para adicionar metas.');
                return;
            }
            const descricao = document.getElementById('metaDescricao').value.trim();
            if (descricao) {
                this.showLoading(true);
                try {
                    await this.db.add('metas', { descricao, ativa: true });
                    document.getElementById('formMeta').reset();
                    await this.loadMetasTemplates();
                    this.showModal('Adicionada', `Meta "${descricao}" criada.`);
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
        if (this.isLocked) {
            this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para excluir.');
            return;
        }
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
        if (this.isLocked) {
            this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para excluir.');
            return;
        }
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
        if (this.isLocked) {
            this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para excluir.');
            return;
        }
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

    async deleteMeta(id) {
        if (this.isLocked) {
            this.showModal('Sistema Bloqueado', 'Desbloqueie o sistema para excluir.');
            return;
        }
        if (!confirm('Excluir esta meta? Ela não aparecerá mais nos próximos dias.')) return;
        this.showLoading(true);
        try {
            await this.db.update('metas', { id, ativa: false });
            await this.loadMetasTemplates();
            this.showModal('Excluída', 'A meta foi desativada.');
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

// Handlers globais
LojaDePontos.prototype._globalPasteHandler = function(e) {
    const lockModal = document.getElementById('lockModal');
    if (lockModal && lockModal.classList.contains('active')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
};

LojaDePontos.prototype._globalCopyHandler = function(e) {
    const lockModal = document.getElementById('lockModal');
    if (lockModal && lockModal.classList.contains('active')) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    }
};

const app = new LojaDePontos();
