// ============================================================
// CONFIGURAÇÃO DO SUPABASE
// Substitua pelas suas credenciais do Supabase
// ============================================================
const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
const SUPABASE_KEY = 'SUA-CHAVE-ANON-AQUI';

// Inicializar cliente Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// CLASSE DATABASE - Wrapper do Supabase
// ============================================================
class Database {
    async getAll(table) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .order('id', { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async get(table, id) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        return data;
    }

    async add(table, data) {
        const { data: result, error } = await supabase
            .from(table)
            .insert([data])
            .select()
            .single();
        if (error) throw error;
        return result;
    }

    async update(table, data) {
        const { error } = await supabase
            .from(table)
            .update(data)
            .eq('id', data.id);
        if (error) throw error;
        return true;
    }

    async delete(table, id) {
        const { error } = await supabase
            .from(table)
            .delete()
            .eq('id', id);
        if (error) throw error;
        return true;
    }
}

// ============================================================
// CLASSE PRINCIPAL - LojaDePontos
// ============================================================
class LojaDePontos {
    constructor() {
        this.db = new Database();
        this.currentUser = null;
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
            this.showModal('Erro de Conexão', 
                'Não foi possível conectar ao banco de dados. Verifique as credenciais do Supabase no script.js');
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================
    setupEventListeners() {
        // Navegação
        document.getElementById('btnDashboard').addEventListener('click', () => this.switchPage('dashboard'));
        document.getElementById('btnAdmin').addEventListener('click', () => this.switchPage('admin'));

        // Seleção de usuário
        document.getElementById('selectUser').addEventListener('change', (e) => this.selectUser(e.target.value));

        // Tabs de histórico
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchHistoryTab(e.target.dataset.tab));
        });

        // Modal
        document.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
        document.getElementById('modalBtn').addEventListener('click', () => this.hideModal());
        document.getElementById('modal').addEventListener('click', (e) => {
            if (e.target.id === 'modal') this.hideModal();
        });
    }

    // ============================================================
    // NAVEGAÇÃO
    // ============================================================
    switchPage(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(page).classList.add('active');
        const btnId = page === 'dashboard' ? 'btnDashboard' : 'btnAdmin';
        document.getElementById(btnId).classList.add('active');
    }

    switchHistoryTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.history-content').forEach(c => c.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`historico${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
    }

    // ============================================================
    // LOADING
    // ============================================================
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
        
        // Atualizar select
        select.innerHTML = '<option value="">-- Selecione um usuário --</option>';
        usuarios.forEach(usuario => {
            const option = document.createElement('option');
            option.value = usuario.id;
            option.textContent = `${usuario.nome} (${usuario.pontos_totais} pts)`;
            select.appendChild(option);
        });

        // Atualizar lista na administração
        usuariosList.innerHTML = '';
        if (usuarios.length === 0) {
            usuariosList.innerHTML = '<p class="empty-state">Nenhum usuário cadastrado</p>';
        } else {
            usuarios.forEach(usuario => {
                const item = document.createElement('div');
                item.className = 'list-item';
                item.innerHTML = `
                    <div class="list-item-info">
                        <div class="list-item-name">${usuario.nome}</div>
                        <div class="list-item-points">${usuario.pontos_totais} pontos</div>
                    </div>
                    <button class="btn btn-danger" onclick="app.deleteUsuario(${usuario.id})">Excluir</button>
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
            return;
        }

        this.currentUser = await this.db.get('usuarios', parseInt(userId));
        this.updatePointsDisplay();
        await this.loadHistorico();
        await this.loadRecompensas(); // Atualizar botões de compra
    }

    updatePointsDisplay() {
        if (this.currentUser) {
            const pointsElement = document.getElementById('totalPoints');
            pointsElement.textContent = this.currentUser.pontos_totais;
            pointsElement.style.animation = 'none';
            setTimeout(() => {
                pointsElement.style.animation = 'countUp 0.5s ease';
            }, 10);
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
            acoesList.innerHTML = '<p class="empty-state">Nenhuma ação cadastrada. Vá em Administração para adicionar.</p>';
            adminAcoesList.innerHTML = '<p class="empty-state">Nenhuma ação cadastrada</p>';
            return;
        }

        acoes.forEach(acao => {
            // Lista do dashboard
            const item = document.createElement('div');
            item.className = 'list-item';
            const pointsClass = acao.valor_pontos >= 0 ? '' : 'negative';
            const pointsText = acao.valor_pontos >= 0 ? `+${acao.valor_pontos}` : acao.valor_pontos;
            
            item.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${acao.descricao}</div>
                    <div class="list-item-points ${pointsClass}">${pointsText} pontos</div>
                </div>
                <button class="btn btn-register" onclick="app.registrarAcao(${acao.id})">Registrar</button>
            `;
            acoesList.appendChild(item);

            // Lista da administração
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
            this.showModal('Atenção', 'Selecione um usuário primeiro!');
            return;
        }

        this.showLoading(true);
        try {
            const acao = await this.db.get('acoes', acaoId);
            
            // Registrar no histórico
            await this.db.add('historico_acoes', {
                data: new Date().toISOString(),
                usuario_id: this.currentUser.id,
                acao_id: acaoId,
                pontos_ganhos_perdidos: acao.valor_pontos
            });

            // Atualizar pontos do usuário
            this.currentUser.pontos_totais += acao.valor_pontos;
            await this.db.update('usuarios', this.currentUser);

            this.updatePointsDisplay();
            await this.loadHistorico();
            await this.loadRecompensas();
            await this.loadUsuarios(); // Atualizar select

            const pontosText = acao.valor_pontos >= 0 ? `+${acao.valor_pontos}` : acao.valor_pontos;
            this.showModal('Ação Registrada! ✅', `"${acao.descricao}" - ${pontosText} pontos`);
        } catch (error) {
            console.error('Erro ao registrar ação:', error);
            this.showModal('Erro', 'Não foi possível registrar a ação.');
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
            recompensasList.innerHTML = '<p class="empty-state" style="grid-column: 1/-1;">Nenhuma recompensa cadastrada. Vá em Administração para adicionar.</p>';
            adminRecompensasList.innerHTML = '<p class="empty-state">Nenhuma recompensa cadastrada</p>';
            return;
        }

        recompensas.forEach(recompensa => {
            // Cards do dashboard
            const card = document.createElement('div');
            card.className = 'reward-card';
            
            const imagemHTML = recompensa.imagem_url 
                ? `<img src="${recompensa.imagem_url}" alt="${recompensa.nome}" onerror="this.style.display='none'">`
                : '';
            
            const canBuy = this.currentUser && this.currentUser.pontos_totais >= recompensa.custo_pontos;
            const disabled = this.currentUser ? (!canBuy ? 'disabled' : '') : 'disabled';
            
            card.innerHTML = `
                ${imagemHTML}
                <h3>${recompensa.nome}</h3>
                <div class="reward-cost">⭐ ${recompensa.custo_pontos} pontos</div>
                <button class="btn btn-buy" onclick="app.comprarRecompensa(${recompensa.id})" ${disabled}>
                    ${this.currentUser ? (canBuy ? 'Comprar' : 'Pontos insuficientes') : 'Selecione usuário'}
                </button>
            `;
            recompensasList.appendChild(card);

            // Lista da administração
            const adminItem = document.createElement('div');
            adminItem.className = 'list-item';
            adminItem.innerHTML = `
                <div class="list-item-info">
                    <div class="list-item-name">${recompensa.nome}</div>
                    <div class="list-item-points">⭐ ${recompensa.custo_pontos} pontos</div>
                </div>
                <button class="btn btn-danger" onclick="app.deleteRecompensa(${recompensa.id})">Excluir</button>
            `;
            adminRecompensasList.appendChild(adminItem);
        });
    }

    async comprarRecompensa(recompensaId) {
        if (!this.currentUser) {
            this.showModal('Atenção', 'Selecione um usuário primeiro!');
            return;
        }

        this.showLoading(true);
        try {
            const recompensa = await this.db.get('recompensas', recompensaId);

            if (this.currentUser.pontos_totais < recompensa.custo_pontos) {
                this.showModal('Pontos Insuficientes ', 
                    `Você precisa de ${recompensa.custo_pontos} pontos. Você tem ${this.currentUser.pontos_totais}.`);
                return;
            }

            // Registrar compra no histórico
            await this.db.add('historico_compras', {
                data: new Date().toISOString(),
                usuario_id: this.currentUser.id,
                recompensa_id: recompensaId,
                pontos_gastos: recompensa.custo_pontos
            });

            // Atualizar pontos do usuário
            this.currentUser.pontos_totais -= recompensa.custo_pontos;
            await this.db.update('usuarios', this.currentUser);

            this.updatePointsDisplay();
            await this.loadHistorico();
            await this.loadRecompensas();
            await this.loadUsuarios();

            this.showModal('Compra Realizada! 🎉', 
                `Você resgatou "${recompensa.nome}" por ${recompensa.custo_pontos} pontos!`);
        } catch (error) {
            console.error('Erro ao comprar recompensa:', error);
            this.showModal('Erro', 'Não foi possível completar a compra.');
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
            // Carregar histórico de ações
            const historicoAcoes = await this.db.getAll('historico_acoes');
            const acoesUsuario = historicoAcoes
                .filter(h => h.usuario_id === this.currentUser.id)
                .sort((a, b) => new Date(b.data) - new Date(a.data))
                .slice(0, 20);
            
            const acoesList = document.getElementById('historicoAcoes');
            acoesList.innerHTML = '';

            if (acoesUsuario.length === 0) {
                acoesList.innerHTML = '<p class="empty-state">Nenhuma ação registrada</p>';
            } else {
                const acoes = await this.db.getAll('acoes');
                
                acoesUsuario.forEach(historico => {
                    const acao = acoes.find(a => a.id === historico.acao_id);
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    
                    const pointsClass = historico.pontos_ganhos_perdidos >= 0 ? 'positive' : 'negative';
                    const pointsText = historico.pontos_ganhos_perdidos >= 0 
                        ? `+${historico.pontos_ganhos_perdidos}` 
                        : historico.pontos_ganhos_perdidos;
                    
                    item.innerHTML = `
                        <div>
                            <div class="list-item-name">${acao ? acao.descricao : 'Ação removida'}</div>
                            <div class="history-date">${new Date(historico.data).toLocaleString('pt-BR')}</div>
                        </div>
                        <div class="history-points ${pointsClass}">${pointsText}</div>
                    `;
                    acoesList.appendChild(item);
                });
            }

            // Carregar histórico de compras
            const historicoCompras = await this.db.getAll('historico_compras');
            const comprasUsuario = historicoCompras
                .filter(h => h.usuario_id === this.currentUser.id)
                .sort((a, b) => new Date(b.data) - new Date(a.data))
                .slice(0, 20);
            
            const comprasList = document.getElementById('historicoCompras');
            comprasList.innerHTML = '';

            if (comprasUsuario.length === 0) {
                comprasList.innerHTML = '<p class="empty-state">Nenhuma compra registrada</p>';
            } else {
                const recompensas = await this.db.getAll('recompensas');
                
                comprasUsuario.forEach(historico => {
                    const recompensa = recompensas.find(r => r.id === historico.recompensa_id);
                    const item = document.createElement('div');
                    item.className = 'history-item';
                    
                    item.innerHTML = `
                        <div>
                            <div class="list-item-name">${recompensa ? recompensa.nome : 'Recompensa removida'}</div>
                            <div class="history-date">${new Date(historico.data).toLocaleString('pt-BR')}</div>
                        </div>
                        <div class="history-points negative">-${historico.pontos_gastos}</div>
                    `;
                    comprasList.appendChild(item);
                });
            }
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
        } finally {
            this.showLoading(false);
        }
    }

    // ============================================================
    // FORMULÁRIOS DE ADMINISTRAÇÃO
    // ============================================================
    setupAdminForms() {
        // Formulário de usuário
        document.getElementById('formUsuario').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('usuarioNome').value.trim();
            
            if (nome) {
                this.showLoading(true);
                try {
                    await this.db.add('usuarios', {
                        nome: nome,
                        pontos_totais: 0
                    });
                    
                    document.getElementById('usuarioNome').value = '';
                    await this.loadUsuarios();
                    this.showModal('Sucesso! ✅', `Usuário "${nome}" adicionado!`);
                } catch (error) {
                    console.error('Erro:', error);
                    this.showModal('Erro', 'Não foi possível adicionar o usuário.');
                } finally {
                    this.showLoading(false);
                }
            }
        });

        // Formulário de recompensa
        document.getElementById('formRecompensa').addEventListener('submit', async (e) => {
            e.preventDefault();
            const nome = document.getElementById('recompensaNome').value.trim();
            const custo = parseInt(document.getElementById('recompensaCusto').value);
            const imagem = document.getElementById('recompensaImagem').value.trim();
            
            if (nome && custo) {
                this.showLoading(true);
                try {
                    await this.db.add('recompensas', {
                        nome: nome,
                        custo_pontos: custo,
                        imagem_url: imagem || null
                    });
                    
                    document.getElementById('formRecompensa').reset();
                    await this.loadRecompensas();
                    this.showModal('Sucesso! ✅', `Recompensa "${nome}" adicionada!`);
                } catch (error) {
                    console.error('Erro:', error);
                    this.showModal('Erro', 'Não foi possível adicionar a recompensa.');
                } finally {
                    this.showLoading(false);
                }
            }
        });

        // Formulário de ação
        document.getElementById('formAcao').addEventListener('submit', async (e) => {
            e.preventDefault();
            const descricao = document.getElementById('acaoDescricao').value.trim();
            const valor = parseInt(document.getElementById('acaoValor').value);
            
            if (descricao && !isNaN(valor)) {
                this.showLoading(true);
                try {
                    await this.db.add('acoes', {
                        descricao: descricao,
                        valor_pontos: valor
                    });
                    
                    document.getElementById('formAcao').reset();
                    await this.loadAcoes();
                    this.showModal('Sucesso! ✅', `Ação "${descricao}" adicionada!`);
                } catch (error) {
                    console.error('Erro:', error);
                    this.showModal('Erro', 'Não foi possível adicionar a ação.');
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
        if (confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) {
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
                console.error('Erro:', error);
                this.showModal('Erro', 'Não foi possível excluir o usuário.');
            } finally {
                this.showLoading(false);
            }
        }
    }

    async deleteAcao(id) {
        if (confirm('Tem certeza que deseja excluir esta ação?')) {
            this.showLoading(true);
            try {
                await this.db.delete('acoes', id);
                await this.loadAcoes();
            } catch (error) {
                console.error('Erro:', error);
                this.showModal('Erro', 'Não foi possível excluir a ação.');
            } finally {
                this.showLoading(false);
            }
        }
    }

    async deleteRecompensa(id) {
        if (confirm('Tem certeza que deseja excluir esta recompensa?')) {
            this.showLoading(true);
            try {
                await this.db.delete('recompensas', id);
                await this.loadRecompensas();
            } catch (error) {
                console.error('Erro:', error);
                this.showModal('Erro', 'Não foi possível excluir a recompensa.');
            } finally {
                this.showLoading(false);
            }
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

// ============================================================
// INICIALIZAR APLICAÇÃO
// ============================================================
const app = new LojaDePontos();
