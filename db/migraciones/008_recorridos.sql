-- =============================================================================
-- 008 · Recorridos guiados (paso a paso por pantalla)
-- Qué recorridos ya vio (terminó o saltó) cada usuario: así se muestran solos solo la primera vez,
-- también al entrar desde otro computador. Es una preferencia del usuario, no un dato de negocio.
-- =============================================================================
CREATE TABLE IF NOT EXISTS cys.app_recorridos_vistos (
    id_usuario  integer      NOT NULL REFERENCES cys.app_usuarios (id_usuario),
    recorrido   varchar(60)  NOT NULL,
    visto_en    timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (id_usuario, recorrido)
);
