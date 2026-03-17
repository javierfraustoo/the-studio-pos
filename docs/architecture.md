# The Studio POS — Arquitectura de Carpetas

## Backend (NestJS + TypeScript)

```
backend/
├── src/
│   ├── main.ts                          # Bootstrap, CORS, Swagger, ValidationPipe
│   ├── app.module.ts                    # Root module
│   │
│   ├── config/
│   │   ├── app.config.ts                # Configuración general (port, env)
│   │   ├── database.config.ts           # TypeORM / PostgreSQL config
│   │   ├── aws.config.ts                # S3, credentials
│   │   └── printer.config.ts            # IPs de impresoras por tienda
│   │
│   ├── common/
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts
│   │   │   └── current-store.decorator.ts
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts
│   │   ├── guards/
│   │   │   ├── auth.guard.ts
│   │   │   └── roles.guard.ts
│   │   ├── interceptors/
│   │   │   └── transform.interceptor.ts
│   │   ├── pipes/
│   │   │   └── parse-uuid.pipe.ts
│   │   └── types/
│   │       └── index.ts
│   │
│   ├── database/
│   │   ├── migrations/                  # TypeORM migrations
│   │   ├── seeds/
│   │   │   ├── units.seed.ts
│   │   │   └── demo-menu.seed.ts        # Menú demo de cafetería
│   │   └── data-source.ts
│   │
│   └── modules/
│       ├── auth/
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts       # Login por PIN, JWT
│       │   ├── auth.service.ts
│       │   ├── strategies/
│       │   │   └── jwt.strategy.ts
│       │   └── dto/
│       │       └── login.dto.ts
│       │
│       ├── stores/
│       │   ├── stores.module.ts
│       │   ├── stores.controller.ts
│       │   ├── stores.service.ts
│       │   └── entities/
│       │       └── store.entity.ts
│       │
│       ├── employees/
│       │   ├── employees.module.ts
│       │   ├── employees.controller.ts
│       │   ├── employees.service.ts
│       │   └── entities/
│       │       └── employee.entity.ts
│       │
│       ├── products/
│       │   ├── products.module.ts
│       │   ├── products.controller.ts
│       │   ├── products.service.ts
│       │   ├── entities/
│       │   │   ├── product.entity.ts
│       │   │   ├── category.entity.ts
│       │   │   ├── modifier-group.entity.ts
│       │   │   └── modifier.entity.ts
│       │   └── dto/
│       │       ├── create-product.dto.ts
│       │       └── create-modifier.dto.ts
│       │
│       ├── inventory/
│       │   ├── inventory.module.ts
│       │   ├── inventory.controller.ts
│       │   ├── inventory.service.ts      # FIFO deduction logic
│       │   ├── entities/
│       │   │   ├── inventory-item.entity.ts
│       │   │   ├── inventory-batch.entity.ts
│       │   │   ├── recipe.entity.ts
│       │   │   ├── modifier-recipe-adjustment.entity.ts
│       │   │   └── inventory-movement.entity.ts
│       │   └── dto/
│       │       ├── receive-batch.dto.ts
│       │       └── adjust-stock.dto.ts
│       │
│       ├── orders/
│       │   ├── orders.module.ts
│       │   ├── orders.controller.ts
│       │   ├── orders.service.ts         # Orquesta: crear orden → descontar inv → imprimir
│       │   ├── entities/
│       │   │   ├── order.entity.ts
│       │   │   ├── order-item.entity.ts
│       │   │   └── order-item-modifier.entity.ts
│       │   └── dto/
│       │       └── create-order.dto.ts
│       │
│       ├── payments/
│       │   ├── payments.module.ts
│       │   ├── payments.controller.ts
│       │   ├── payments.service.ts
│       │   └── entities/
│       │       └── payment.entity.ts
│       │
│       ├── cash-register/
│       │   ├── cash-register.module.ts
│       │   ├── cash-register.controller.ts
│       │   ├── cash-register.service.ts
│       │   └── entities/
│       │       └── cash-register-session.entity.ts
│       │
│       ├── printing/
│       │   ├── printing.module.ts
│       │   ├── printing.service.ts       # Cola de impresión + retry
│       │   ├── escpos.builder.ts         # Constructor de comandos ESC/POS
│       │   ├── templates/
│       │   │   ├── receipt.template.ts   # Template del recibo
│       │   │   └── bar-order.template.ts # Template comanda de barra
│       │   └── entities/
│       │       ├── print-job.entity.ts
│       │       └── printer.entity.ts
│       │
│       └── sync/
│           ├── sync.module.ts
│           ├── sync.controller.ts        # Endpoints para sincronización offline
│           └── sync.service.ts           # Reconciliación de datos offline → server
│
├── test/
│   ├── orders.e2e-spec.ts
│   └── inventory.e2e-spec.ts
│
├── .env.example
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── package.json
└── docker-compose.yml                    # PostgreSQL + Redis para dev local
```

## Frontend Mobile (React Native — Tablet POS)

```
mobile/
├── src/
│   ├── App.tsx
│   │
│   ├── navigation/
│   │   ├── AppNavigator.tsx
│   │   ├── AuthNavigator.tsx
│   │   └── MainTabNavigator.tsx
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   └── PinLoginScreen.tsx        # Login rápido por PIN
│   │   ├── pos/
│   │   │   ├── POSScreen.tsx             # Pantalla principal de venta (split view)
│   │   │   ├── MenuGrid.tsx              # Grid de categorías y productos
│   │   │   ├── CartPanel.tsx             # Panel lateral del carrito
│   │   │   ├── ModifierSheet.tsx         # Bottom sheet para modificadores
│   │   │   └── CheckoutSheet.tsx         # Sheet de pago (one-tap)
│   │   ├── orders/
│   │   │   ├── OrdersListScreen.tsx      # Listado de órdenes activas
│   │   │   └── OrderDetailScreen.tsx
│   │   ├── inventory/
│   │   │   ├── InventoryScreen.tsx       # Vista de stock actual
│   │   │   ├── ReceiveBatchScreen.tsx    # Registrar nueva entrada de inventario
│   │   │   └── ExpiryAlertsScreen.tsx    # Alertas de caducidad
│   │   ├── cash-register/
│   │   │   ├── OpenRegisterScreen.tsx
│   │   │   └── CloseRegisterScreen.tsx
│   │   └── settings/
│   │       ├── SettingsScreen.tsx
│   │       └── PrinterSetupScreen.tsx
│   │
│   ├── components/
│   │   ├── ui/                           # Design system
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── BottomSheet.tsx
│   │   │   ├── NumericKeypad.tsx         # Teclado numérico para cantidades
│   │   │   └── Toast.tsx
│   │   ├── products/
│   │   │   ├── ProductCard.tsx
│   │   │   └── CategoryTab.tsx
│   │   ├── cart/
│   │   │   ├── CartItem.tsx
│   │   │   └── CartSummary.tsx
│   │   └── orders/
│   │       ├── OrderCard.tsx
│   │       └── OrderStatusBadge.tsx
│   │
│   ├── database/                         # WatermelonDB (Offline-First)
│   │   ├── index.ts                      # Database initialization
│   │   ├── schema.ts                     # WatermelonDB schema
│   │   ├── migrations.ts
│   │   └── models/
│   │       ├── Product.ts
│   │       ├── Category.ts
│   │       ├── Modifier.ts
│   │       ├── Order.ts
│   │       ├── OrderItem.ts
│   │       ├── InventoryItem.ts
│   │       └── InventoryBatch.ts
│   │
│   ├── services/
│   │   ├── api.ts                        # Axios instance + interceptors
│   │   ├── sync.service.ts              # Sync offline → server
│   │   ├── printer.service.ts           # ESC/POS desde el dispositivo
│   │   └── auth.service.ts
│   │
│   ├── store/                            # Zustand state management
│   │   ├── useCartStore.ts
│   │   ├── useAuthStore.ts
│   │   ├── useOrderStore.ts
│   │   └── useSyncStore.ts
│   │
│   ├── hooks/
│   │   ├── useProducts.ts
│   │   ├── useInventory.ts
│   │   ├── useOrders.ts
│   │   └── useOfflineSync.ts
│   │
│   ├── theme/
│   │   ├── index.ts                      # Colores, tipografía, espaciado
│   │   ├── colors.ts                     # Paleta minimalista (blancos, negros, acentos)
│   │   └── typography.ts
│   │
│   ├── utils/
│   │   ├── currency.ts
│   │   ├── date.ts
│   │   └── escpos.ts                     # Helper para construir buffers ESC/POS
│   │
│   └── types/
│       ├── product.types.ts
│       ├── order.types.ts
│       └── inventory.types.ts
│
├── assets/
│   ├── fonts/
│   └── images/
│
├── ios/
├── android/
├── app.json
├── metro.config.js
├── babel.config.js
├── tsconfig.json
└── package.json
```

## Infraestructura AWS (referencia)

```
infrastructure/
├── terraform/                (o CloudFormation)
│   ├── main.tf
│   ├── rds.tf               # PostgreSQL RDS
│   ├── ec2.tf               # o Elastic Beanstalk
│   ├── s3.tf                # Bucket para imágenes de productos
│   ├── vpc.tf
│   └── variables.tf
└── docker/
    ├── Dockerfile.backend
    └── docker-compose.yml
```
