export default function LoginScreen({
  onLogin,
  error,
}: {
  onLogin: () => void;
  error?: string;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f0f4f8",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 40,
          boxShadow: "0 4px 24px rgba(0,0,0,0.1)",
          maxWidth: 360,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 52, marginBottom: 16 }}>📊</div>
        <h1
          style={{ margin: "0 0 8px", fontSize: 22, color: "#1a2744", fontWeight: 700 }}
        >
          Mi Cartera de Inversión
        </h1>
        <p style={{ margin: "0 0 32px", color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>
          Inicia sesión con Google para sincronizar tus datos con Drive y
          acceder desde cualquier dispositivo.
        </p>
        {error && (
          <p
            style={{
              background: "#fff1f2",
              color: "#dc2626",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </p>
        )}
        <button
          onClick={onLogin}
          style={{
            background: "#3b5bdb",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "14px 32px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            width: "100%",
          }}
        >
          Conectar con Google
        </button>
      </div>
    </div>
  );
}
