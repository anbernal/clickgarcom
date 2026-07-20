(() => {
  const runtimeConfig = window.CLICKGARCOM_RUNTIME_CONFIG || {};
  const apiBase = String(runtimeConfig.publicTablesApiBaseUrl || `${window.location.origin}/admin/api/public/tables`).replace(/\/+$/, '');
  const icon = document.getElementById('exit-icon');
  const title = document.getElementById('exit-title');
  const description = document.getElementById('exit-description');
  const status = document.getElementById('exit-status');
  const code = document.getElementById('exit-code');

  function setState(kind, nextTitle, nextDescription, nextStatus, nextIcon) {
    icon.textContent = nextIcon;
    title.textContent = nextTitle;
    description.textContent = nextDescription;
    status.textContent = nextStatus;
    status.className = `exit-status ${kind || ''}`.trim();
  }

  function getAccess() {
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return {
      tabId: hash.get('tab_id') || query.get('tab_id') || '',
      accessToken: hash.get('access_token') || query.get('access_token') || '',
    };
  }

  async function validate() {
    const { tabId, accessToken } = getAccess();
    if (!tabId || !accessToken) {
      setState('error', 'Link incompleto', 'Use o QR Code ou o link individual da sua comanda.', 'Não foi possível identificar a comanda.', '⚠️');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/tabs/${encodeURIComponent(tabId)}/exit/validate?access_token=${encodeURIComponent(accessToken)}`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || 'A conta ainda não está liberada para saída.');

      setState('success', 'Saída liberada', 'A conta foi validada. Você pode deixar o restaurante.', 'Pagamento e pedidos conferidos com sucesso.', '✅');
      if (payload.publicCode) code.textContent = `Comanda ${payload.publicCode}`;
    } catch (error) {
      setState('error', 'Saída não liberada', 'Procure a equipe para regularizar a comanda.', error.message || 'A conta ainda possui pendências.', '⛔');
    }
  }

  validate();
})();
