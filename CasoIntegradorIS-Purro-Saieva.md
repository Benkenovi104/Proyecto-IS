# Caso Integrador: Portal de Venta de Entradas (Ampliado) — versión revisada

Resolución integral combinando las vistas del sistema (**Casos de Uso, Clases y Actividades**) sobre el caso base de la cátedra, incorporando:

1. **Dibujo de escenario y ubicaciones en el mapa**
2. **Pago de estacionamiento anticipado**
3. **Compra de consumiciones antes del evento**
4. **Reembolsos y transferencia de entradas**

### Supuestos adoptados para la ampliación

El enunciado base no define estas reglas; se fijan acá para que las tres vistas sean consistentes entre sí:

- Una **compra corresponde a una sola función** (el límite de 6 entradas es por comprador y por función).
- El estacionamiento y las consumiciones se agregan **en el checkout de la compra de entradas** (se pagan juntos, en un único pago).
- El estacionamiento es **un pase por patente**; las consumiciones son **por evento** y se canjean con un voucher QR.
- Una **transferencia** requiere que el destinatario esté registrado y **la acepte**; recién ahí se anula el QR anterior y se genera uno nuevo.
- El **reembolso** se puede pedir hasta **48 h antes** de la función; al pedirlo se anulan los QR de lo devuelto antes de reintegrar el dinero.

---

## 1. Vista 1: Casos de Uso — ¿Quién usa el sistema y para qué?

Un diagrama por actor, más uno con los casos de uso **compartidos** (se dibujan una sola vez con todos sus actores).

### 1.1. Actor Administrador (Backoffice)

```mermaid
flowchart LR
    Admin["👤 Administrador"]

    subgraph Backoffice ["Backoffice"]
        CU_Salas(["Gestionar salas"])
        CU_Escenario(["Dibujar escenario y definir sectores"])
        CU_Butacas(["Cargar mapa de butacas"])
        CU_Playa(["Gestionar playas de estacionamiento"])
        CU_Blacklist(["Gestionar lista negra<br/>(derecho de admisión)"])
        CU_Usuarios(["Gestionar usuarios del backoffice"])
    end

    Admin --- CU_Salas
    Admin --- CU_Escenario
    Admin --- CU_Butacas
    Admin --- CU_Playa
    Admin --- CU_Blacklist
    Admin --- CU_Usuarios
```

### 1.2. Actor Organizador (Backoffice)

```mermaid
flowchart LR
    Org["👤 Organizador"]

    subgraph Backoffice ["Backoffice"]
        CU_Evento(["Crear evento"])
        CU_Funcion(["Programar función"])
        CU_Ajustar(["Ajustar escenario de la función"])
        CU_Precios(["Definir precios por sector"])
        CU_Descuentos(["Cargar descuentos"])
        CU_TarifaEst(["Configurar estacionamiento por función"])
        CU_CatalogoCons(["Gestionar catálogo de consumiciones"])
        CU_Publicar(["Publicar / despublicar función"])
    end

    Org --- CU_Evento
    Org --- CU_Funcion
    Org --- CU_Precios
    Org --- CU_Descuentos
    Org --- CU_TarifaEst
    Org --- CU_CatalogoCons
    Org --- CU_Publicar

    CU_Ajustar -. "«extend»" .-> CU_Funcion
```

### 1.3. Casos de uso compartidos

```mermaid
flowchart LR
    Admin["👤 Administrador"]
    Org["👤 Organizador"]
    Comp["👤 Comprador"]
    Ctrl["👤 Controlador de acceso"]

    subgraph Sistema ["TicketFr"]
        CU_Login(["Iniciar sesión"])
        CU_Reportes(["Consultar reportes de venta"])
    end

    Admin --- CU_Login
    Org --- CU_Login
    Comp --- CU_Login
    Ctrl --- CU_Login
    Admin --- CU_Reportes
    Org --- CU_Reportes
```

### 1.4. Actor Comprador (Portal de venta)

```mermaid
flowchart LR
    Comp["👤 Comprador"]
    Pasarela["🏦 Pasarela de pagos<br/>«externo»"]
    Mailing["✉️ Servicio de mailing<br/>«externo»"]

    subgraph Portal ["Portal de venta"]
        CU_Registrarse(["Registrarse"])
        CU_Buscar(["Buscar eventos"])
        CU_Seleccionar(["Seleccionar ubicaciones en el mapa"])
        CU_Comprar(["Comprar entradas"])
        CU_Estacionamiento(["Comprar estacionamiento anticipado"])
        CU_Consumiciones(["Comprar consumiciones anticipadas"])
        CU_Pago(["Registrar el pago"])
        CU_Historial(["Consultar historial de compras"])
        CU_Descargar(["Descargar QRs de la compra"])
        CU_Reembolso(["Solicitar reembolso"])
        CU_Reintegro(["Reintegrar pago"])
        CU_Transferir(["Transferir entrada"])
        CU_Aceptar(["Aceptar transferencia"])
    end

    Comp --- CU_Registrarse
    Comp --- CU_Buscar
    Comp --- CU_Seleccionar
    Comp --- CU_Comprar
    Comp --- CU_Historial
    Comp --- CU_Reembolso
    Comp --- CU_Transferir
    Comp --- CU_Aceptar

    CU_Estacionamiento -. "«extend»" .-> CU_Comprar
    CU_Consumiciones -. "«extend»" .-> CU_Comprar
    CU_Descargar -. "«extend»" .-> CU_Historial

    CU_Comprar -. "«include»" .-> CU_Pago
    CU_Reembolso -. "«include»" .-> CU_Reintegro

    CU_Pago --- Pasarela
    CU_Reintegro --- Pasarela
    CU_Comprar --- Mailing
    CU_Reembolso --- Mailing
    CU_Transferir --- Mailing
    CU_Aceptar --- Mailing
```

> **Reglas de negocio que no son casos de uso** (van en la descripción textual): reserva de 10 min, tope de 6 entradas por función, ventana de 48 h para el reembolso, verificación de lista negra al comprar y al aceptar una transferencia.

### 1.5. Actor Controlador de acceso

```mermaid
flowchart LR
    Ctrl["👤 Controlador de acceso"]

    subgraph Acceso ["Control de acceso (puerta, playa y barras)"]
        CU_ValEntrada(["Validar entrada"])
        CU_ValEst(["Validar pase de estacionamiento"])
        CU_CanjearCons(["Canjear voucher de consumición"])
        CU_LeerQR(["Leer y verificar código QR"])
        CU_Aforo(["Consultar aforo ingresado"])
        CU_Sync(["Sincronizar padrón para modo sin conexión"])
    end

    Ctrl --- CU_ValEntrada
    Ctrl --- CU_ValEst
    Ctrl --- CU_CanjearCons
    Ctrl --- CU_Aforo
    Ctrl --- CU_Sync

    CU_ValEntrada -. "«include»" .-> CU_LeerQR
    CU_ValEst -. "«include»" .-> CU_LeerQR
    CU_CanjearCons -. "«include»" .-> CU_LeerQR
```


## 2. Vista 2: Clases — ¿Qué entidades existen y cómo se relacionan?

### 2.1. Modelo de dominio

```mermaid
classDiagram
    direction TB

    class Organizador
    note for Organizador "atributos en la jerarquía 2.2"

    class Evento {
        -nombre: String
        -categoria: Categoria
    }

    class Funcion {
        -fechaHora: DateTime
        -estado: EstadoFuncion
        +publicar() void
        +despublicar() void
        +butacasDisponibles() List~Butaca~
        +cupoEstacionamientoDisponible() int
    }

    class Sala {
        -nombre: String
        -direccion: String
    }

    class Escenario {
        -nombre: String
        -esBase: boolean
        -posX: float
        -posY: float
        -ancho: float
        -alto: float
        -poligonoSVG: String
    }

    class Sector {
        -nombre: String
        -numerado: boolean
        -cupoMaximo: int
        -poligonoSVG: String
    }

    class Butaca {
        -fila: String
        -numero: int
        -posX: float
        -posY: float
    }

    class Tarifa {
        -precio: Decimal
        +precioVigente(fecha: Date) Decimal
    }

    class Descuento {
        -porcentaje: Decimal
        -vigenciaDesde: Date
        -vigenciaHasta: Date
        +estaVigente(fecha: Date) boolean
    }

    class PlayaEstacionamiento {
        -nombre: String
        -capacidadTotal: int
    }

    class TarifaEstacionamiento {
        -precio: Decimal
        -cupoHabilitado: int
    }

    class ProductoConsumicion {
        -nombre: String
        -descripcion: String
        -precioPreventa: Decimal
        -stockDisponible: int
        +descontarStock(cant: int) void
        +restituirStock(cant: int) void
    }

    class Comprador {
        -nombre: String
        -dni: String
    }

    class Compra {
        -fecha: DateTime
        -fechaExpiracionReserva: DateTime
        -estado: EstadoCompra
        -idTransaccionPago: String
        +total() Decimal
        +liberarReserva() void
        +esReembolsable() boolean
    }

    class Entrada {
        -codigoQR: String
        -precio: Decimal
        -estado: EstadoEntrada
        +validar() boolean
        +marcarUsada() void
        +regenerarQR() void
        +anular() void
    }

    class PaseEstacionamiento {
        -patente: String
        -codigoQR: String
        -precio: Decimal
        -estado: EstadoEntrada
        +validar() boolean
        +marcarUsado() void
        +anular() void
    }

    class VoucherConsumicion {
        -codigoQR: String
        -estado: EstadoEntrada
        +canjear() void
        +anular() void
        +total() Decimal
    }

    class ItemConsumicion {
        -cantidad: int
        -precioUnitario: Decimal
        +subtotal() Decimal
    }

    class TransferenciaEntrada {
        -fechaHora: DateTime
        -estado: EstadoTransferencia
        +aceptar() void
        +rechazar() void
    }

    class Reembolso {
        -fechaSolicitud: DateTime
        -montoReintegrado: Decimal
        -motivo: String
        -estado: EstadoReembolso
    }

    class RegistroListaNegra {
        -dni: String
        -motivo: String
        -fechaAlta: Date
    }

    %% Relaciones base del dominio
    Organizador "1" --> "0..*" Evento : organiza
    Evento "1" *-- "1..*" Funcion : tiene
    Funcion "0..*" --> "1" Sala : se realiza en
    Sala "1" *-- "1..*" Sector : se divide en
    Sector "1" *-- "0..*" Butaca : contiene
    Funcion "1" *-- "1..*" Tarifa : define
    Tarifa "0..*" --> "1" Sector : aplica a
    Tarifa "1" *-- "0..*" Descuento : tiene
    Comprador "1" --> "0..*" Compra : realiza
    Compra "0..*" --> "1" Funcion : corresponde a
    Compra "1" *-- "1..*" Entrada : incluye
    Entrada "0..*" --> "1" Sector : ubicada en
    Entrada "0..*" --> "0..1" Butaca : asignada a

    %% Dibujo de escenario
    Sala "1" *-- "1..*" Escenario : posee diseños
    Funcion "0..*" --> "1" Escenario : se monta con

    %% Estacionamiento
    Sala "1" *-- "0..*" PlayaEstacionamiento : cuenta con
    Funcion "1" *-- "0..*" TarifaEstacionamiento : habilita
    TarifaEstacionamiento "0..*" --> "1" PlayaEstacionamiento : sobre
    Compra "1" *-- "0..*" PaseEstacionamiento : adiciona
    PaseEstacionamiento "0..*" --> "1" TarifaEstacionamiento : corresponde a

    %% Consumiciones
    Evento "1" *-- "0..*" ProductoConsumicion : ofrece en preventa
    Compra "1" *-- "0..1" VoucherConsumicion : adiciona
    VoucherConsumicion "1" *-- "1..*" ItemConsumicion : detalla
    ItemConsumicion "0..*" --> "1" ProductoConsumicion : refiere a

    %% Reembolsos y transferencias
    Compra "1" --> "0..*" Reembolso : origina
    Reembolso "0..1" --> "1..*" Entrada : devuelve
    Entrada "1" *-- "0..*" TransferenciaEntrada : registra
    TransferenciaEntrada "0..*" --> "1" Comprador : cedente
    TransferenciaEntrada "0..*" --> "1" Comprador : destinatario
    Entrada "0..*" --> "1" Comprador : titularActual

    note for Compra "{máx. 6 entradas vigentes por comprador y función}<br/>{la reserva vence 10 min después de fecha}"
    note for Funcion "{su escenario pertenece a su misma sala}"
    note for Entrada "{si tiene butaca, la butaca pertenece a su sector}"
```

### 2.2. Jerarquía de usuarios

```mermaid
classDiagram
    class Usuario {
        <<abstract>>
        -email: String
        -password: Hash
        -activo: boolean
        +autenticar() boolean
    }

    class Administrador {
        +altaSala() void
        +dibujarEscenarioYSectores() void
        +cargarMapaButacas() void
        +gestionarEstacionamientoSala() void
        +gestionarListaNegra() void
        +gestionarUsuarios() void
    }

    class Organizador {
        -productora: String
        +crearEvento() void
        +programarFuncion() void
        +publicarFuncion() void
        +configurarTarifaEstacionamiento() void
        +gestionarCatalogoConsumiciones() void
    }

    class Comprador {
        -nombre: String
        -dni: String
        +comprar() void
        +solicitarReembolso() void
        +transferirEntrada() void
        +aceptarTransferencia() void
    }

    class ControladorAcceso {
        -puntoAcceso: String
        +escanearQR() boolean
        +consultarAforo() int
        +sincronizarPadron() void
    }

    Usuario <|-- Administrador
    Usuario <|-- Organizador
    Usuario <|-- Comprador
    Usuario <|-- ControladorAcceso
```

> `Comprador` y `Organizador` son **la misma clase** en las dos vistas: el email y la contraseña los heredan de `Usuario`.

### 2.3. Enumeraciones

```mermaid
classDiagram
    class Categoria {
        <<enumeration>>
        RECITAL
        TEATRO
        DEPORTE
        OTRO
    }
    class EstadoFuncion {
        <<enumeration>>
        BORRADOR
        PUBLICADA
        DESPUBLICADA
        FINALIZADA
    }
    class EstadoCompra {
        <<enumeration>>
        RESERVADA
        PENDIENTE_PAGO
        PAGADA
        VENCIDA
        REEMBOLSADA
    }
    class EstadoEntrada {
        <<enumeration>>
        VIGENTE
        USADA
        ANULADA
    }
    class EstadoTransferencia {
        <<enumeration>>
        PENDIENTE
        ACEPTADA
        RECHAZADA
        CANCELADA
    }
    class EstadoReembolso {
        <<enumeration>>
        PENDIENTE
        COMPLETADO
        RECHAZADO
    }
```

---

## 3. Vista 3: Actividades — ¿Cómo fluye el trabajo?

Cada diagrama usa **calles** (actor / sistema / externos), nodo inicial ●, nodo final ◉, decisiones ◇ y barras negras de **bifurcación/unión** (fork/join) para lo que ocurre en paralelo.

### 3.1. Comprar entradas (con adicionales y pago)

```mermaid
flowchart TD
    classDef inicio fill:#111,stroke:#111,color:#111
    classDef fin fill:#111,stroke:#111,color:#fff
    classDef barra fill:#111,stroke:#111,color:#111,font-size:2px

    subgraph LC ["👤 Comprador"]
        ini((" ")):::inicio
        c1["Elegir función"]
        c2["Seleccionar ubicaciones<br/>en el mapa"]
        dAd{"¿Agrega<br/>adicionales?"}
        c3["Elegir estacionamiento (patente)<br/>y/o consumiciones"]
        c4["Confirmar y pagar"]
    end

    subgraph LS ["🖥️ Sistema TicketFr"]
        s1["Mostrar mapa con disponibilidad"]
        d1{"¿Supera 6 entradas<br/>para la función?"}
        d2{"¿Ubicaciones<br/>siguen libres?"}
        s2["Informar motivo"]
        s3["Reservar ubicaciones<br/>(vence en 10 min)"]
        s4["Verificar cupo/stock<br/>y sumarlo a la reserva"]
        m1{" "}
        s5["Calcular total con<br/>descuentos vigentes"]
        d3{"¿Reserva vigente?"}
        s6["Liberar reserva<br/>e informar"]
        s7["Solicitar cobro"]
        d4{"Respuesta de<br/>la pasarela"}
        s8["Informar rechazo<br/>(reserva sigue vigente)"]
        s9["Dejar compra en<br/>PENDIENTE_PAGO"]
        s10["Generar QRs de entradas,<br/>pases y vouchers"]
        F1[" "]:::barra
        s11["Registrar venta: marcar vendidas,<br/>descontar cupo y stock"]
        J1[" "]:::barra
        s12["Mostrar confirmación"]
        fin1(((" "))):::fin
        fin2(((" "))):::fin
    end

    subgraph LP ["🏦 Pasarela de pagos «externo»"]
        p1["Procesar pago"]
    end

    subgraph LM ["✉️ Servicio de mailing «externo»"]
        mm1["Enviar correo con QRs"]
    end

    ini --> c1 --> s1 --> c2 --> d1
    d1 -- sí --> s2 --> c2
    d1 -- no --> d2
    d2 -- no --> s2
    d2 -- sí --> s3 --> dAd
    dAd -- sí --> c3 --> s4 --> m1
    dAd -- no --> m1
    m1 --> s5 --> c4 --> d3
    d3 -- no --> s6 --> fin2
    d3 -- sí --> s7 --> p1 --> d4
    d4 -- rechazado --> s8 --> c4
    d4 -- sin respuesta --> s9 --> fin2
    d4 -- aprobado --> s10 --> F1
    F1 --> s11 --> J1
    F1 --> mm1 --> J1
    J1 --> s12 --> fin1
```

### 3.2. Vencimiento de la reserva (evento temporal)

La reserva de 10 minutos no aparece en casos de uso ni en clases: es **comportamiento temporal**, y se modela acá.

```mermaid
flowchart TD
    classDef fin fill:#111,stroke:#111,color:#fff
    classDef barra fill:#111,stroke:#111,color:#111,font-size:2px

    subgraph LS ["🖥️ Sistema TicketFr"]
        t1>"⏳ Venció fechaExpiracionReserva"]
        d1{"Estado de<br/>la compra"}
        s1["Extender retención 5 min<br/>(una sola vez)"]
        F1[" "]:::barra
        s2["Liberar butacas y<br/>cupo de sectores"]
        s3["Restituir cupo<br/>de estacionamiento"]
        s4["Restituir stock<br/>de consumiciones"]
        J1[" "]:::barra
        s5["Marcar compra VENCIDA"]
        fin1(((" "))):::fin
    end

    t1 --> d1
    d1 -- PAGADA --> fin1
    d1 -- "PENDIENTE_PAGO<br/>sin extender" --> s1 --> fin1
    d1 -- "RESERVADA o<br/>PENDIENTE ya extendida" --> F1
    F1 --> s2 --> J1
    F1 --> s3 --> J1
    F1 --> s4 --> J1
    J1 --> s5 --> fin1
```

### 3.3. Solicitar reembolso

```mermaid
flowchart TD
    classDef inicio fill:#111,stroke:#111,color:#111
    classDef fin fill:#111,stroke:#111,color:#fff
    classDef barra fill:#111,stroke:#111,color:#111,font-size:2px

    subgraph LC ["👤 Comprador"]
        ini((" ")):::inicio
        c1["Elegir compra y entradas<br/>a devolver"]
        c2["Confirmar e indicar motivo"]
    end

    subgraph LS ["🖥️ Sistema TicketFr"]
        d1{"¿Faltan más de 48 h<br/>para la función?"}
        d2{"¿Entradas vigentes y<br/>es titular actual?"}
        s0["Informar que no<br/>es reembolsable"]
        s1["Calcular monto<br/>(entradas + adicionales)"]
        s2["Anular QRs de lo devuelto"]
        s3["Solicitar reintegro"]
        d3{"¿Reintegro<br/>aprobado?"}
        s4["Dejar reembolso PENDIENTE<br/>y programar reintento"]
        F1[" "]:::barra
        s5["Liberar ubicaciones,<br/>cupo y stock"]
        J1[" "]:::barra
        s6["Marcar reembolso COMPLETADO"]
        fin1(((" "))):::fin
        fin2(((" "))):::fin
    end

    subgraph LP ["🏦 Pasarela de pagos «externo»"]
        p1["Procesar reintegro"]
    end

    subgraph LM ["✉️ Servicio de mailing «externo»"]
        mm1["Enviar comprobante"]
    end

    ini --> c1 --> d1
    d1 -- no --> s0 --> fin2
    d1 -- sí --> d2
    d2 -- no --> s0
    d2 -- sí --> s1 --> c2 --> s2 --> s3 --> p1 --> d3
    d3 -- no --> s4 --> fin2
    d3 -- sí --> F1
    F1 --> s5 --> J1
    F1 --> mm1 --> J1
    J1 --> s6 --> fin1
```

### 3.4. Transferir y aceptar una entrada

```mermaid
flowchart TD
    classDef inicio fill:#111,stroke:#111,color:#111
    classDef fin fill:#111,stroke:#111,color:#fff
    classDef barra fill:#111,stroke:#111,color:#111,font-size:2px

    subgraph LCed ["👤 Comprador (cedente)"]
        ini((" ")):::inicio
        c1["Elegir entrada e ingresar<br/>DNI o correo del destinatario"]
    end

    subgraph LS ["🖥️ Sistema TicketFr"]
        d1{"¿Entrada vigente y sin<br/>transferencia pendiente?"}
        d2{"¿Destinatario<br/>registrado?"}
        d3{"¿En lista negra o<br/>supera 6 entradas?"}
        s0["Rechazar e informar"]
        s1["Registrar transferencia<br/>PENDIENTE"]
        s2["Marcar RECHAZADA"]
        d4{"¿Entrada sigue<br/>vigente?"}
        s3["Anular QR anterior y<br/>generar QR nuevo"]
        s4["Cambiar titular actual y<br/>marcar ACEPTADA"]
        F1[" "]:::barra
        J1[" "]:::barra
        fin1(((" "))):::fin
        fin2(((" "))):::fin
    end

    subgraph LM ["✉️ Servicio de mailing «externo»"]
        mm1["Notificar al destinatario"]
        mm2["Enviar QR nuevo<br/>al destinatario"]
        mm3["Avisar al cedente"]
        mm4["Avisar rechazo<br/>al cedente"]
    end

    subgraph LDes ["👤 Comprador (destinatario)"]
        dAc{"¿Acepta?"}
    end

    ini --> c1 --> d1
    d1 -- no --> s0 --> fin2
    d1 -- sí --> d2
    d2 -- no --> s0
    d2 -- sí --> d3
    d3 -- sí --> s0
    d3 -- no --> s1 --> mm1 --> dAc
    dAc -- no --> s2 --> mm4 --> fin2
    dAc -- sí --> d4
    d4 -- no --> s0
    d4 -- sí --> s3 --> s4 --> F1
    F1 --> mm2 --> J1
    F1 --> mm3 --> J1
    J1 --> fin1
```

### 3.5. Validar QR en puerta, playa o barra

```mermaid
flowchart TD
    classDef inicio fill:#111,stroke:#111,color:#111
    classDef fin fill:#111,stroke:#111,color:#fff

    subgraph LCt ["👤 Controlador de acceso"]
        ini((" ")):::inicio
        c1["Escanear QR"]
        c2["Dejar pasar / entregar"]
        c3["Impedir el acceso"]
    end

    subgraph LS ["🖥️ Sistema TicketFr"]
        d0{"¿Hay conexión?"}
        s1["Buscar código<br/>en el servidor"]
        s2["Buscar código en el<br/>padrón local"]
        m1{" "}
        d1{"¿El código existe?"}
        d2{"Estado del<br/>código"}
        d3{"¿Corresponde a esta<br/>función y punto?"}
        s3["Marcar USADA<br/>(o encolar si es offline)"]
        s4["Mostrar ✅ aprobado"]
        s5["Mostrar ❌ y el motivo"]
        fin1(((" "))):::fin
    end

    ini --> c1 --> d0
    d0 -- sí --> s1 --> m1
    d0 -- no --> s2 --> m1
    m1 --> d1
    d1 -- no --> s5
    d1 -- sí --> d2
    d2 -- "USADA / ANULADA" --> s5
    d2 -- VIGENTE --> d3
    d3 -- no --> s5
    d3 -- sí --> s3 --> s4 --> c2 --> fin1
    s5 --> c3 --> fin1
```

### 3.6. Preparar y publicar una función (organizador)

```mermaid
flowchart TD
    classDef inicio fill:#111,stroke:#111,color:#111
    classDef fin fill:#111,stroke:#111,color:#fff
    classDef barra fill:#111,stroke:#111,color:#111,font-size:2px

    subgraph LO ["👤 Organizador"]
        ini((" ")):::inicio
        o1["Crear evento<br/>(si no existe)"]
        o2["Programar función:<br/>sala, fecha y hora"]
        dE{"¿Ajusta el<br/>escenario?"}
        o3["Elegir variante<br/>de escenario"]
        mE{" "}
        F1[" "]:::barra
        o4["Definir precios<br/>por sector"]
        o5["Cargar descuentos"]
        dP{"¿Ofrece<br/>estacionamiento?"}
        o6["Configurar tarifas<br/>de estacionamiento"]
        mP{" "}
        dC{"¿Preventa de<br/>consumiciones?"}
        o7["Cargar catálogo<br/>de consumiciones"]
        mC{" "}
        J1[" "]:::barra
        o8["Solicitar publicación"]
        o9["Completar lo faltante"]
    end

    subgraph LS ["🖥️ Sistema TicketFr"]
        d1{"¿Sala libre en<br/>esa fecha y hora?"}
        s0["Informar conflicto"]
        d2{"¿Todos los sectores<br/>tienen precio?"}
        s1["Informar sectores<br/>sin precio"]
        s2["Publicar función<br/>(estado PUBLICADA)"]
        fin1(((" "))):::fin
    end

    ini --> o1 --> o2 --> d1
    d1 -- no --> s0 --> o2
    d1 -- sí --> dE
    dE -- sí --> o3 --> mE
    dE -- no --> mE
    mE --> F1
    F1 --> o4 --> o5 --> J1
    F1 --> dP
    dP -- sí --> o6 --> mP
    dP -- no --> mP
    mP --> J1
    F1 --> dC
    dC -- sí --> o7 --> mC
    dC -- no --> mC
    mC --> J1
    J1 --> o8 --> d2
    d2 -- no --> s1 --> o9 --> o8
    d2 -- sí --> s2 --> fin1
```

---
