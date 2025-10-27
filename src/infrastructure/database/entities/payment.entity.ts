import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('payments')
@Index('idx_payments_idempotency_key', ['idempotencyKey'])
export class PaymentEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column()
  orderId!: string;

  @Column('bigint')
  amount!: number;

  @Column()
  currency!: string;

  @Column()
  status!: string;

  @Column({ unique: true })
  idempotencyKey!: string;

  @Column()
  paymentGateway!: string;

  @Column({ nullable: true })
  providerOrderId?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
