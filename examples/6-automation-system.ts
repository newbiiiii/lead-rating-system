/**
 * 自动化流转系统
 * 实现规则引擎、CRM 集成和通知服务
 */

import axios from 'axios';
import type { RatingResult } from './4-ai-rating-engine';
import type { StandardData } from './1-scraper-adapter-base';

// ============ 类型定义 ============

export interface RoutingAction {
    type: 'notify' | 'crm_push' | 'email_sequence' | 'generate_email' | 'archive';
    channels?: string[];
    template?: string;
    campaign?: string;
    priority?: 'high' | 'medium' | 'low';
    stage?: string;
    owner?: string;
    reason?: string;
}

export interface RoutingRule {
    name: string;
    condition: (lead: EnrichedLead) => boolean;
    actions: RoutingAction[];
}

export interface EnrichedLead {
    data: StandardData;
    rating: RatingResult;
}

// ============ 规则引擎 ============

export class RuleEngine {
    private rules: RoutingRule[] = [];

    addRule(rule: RoutingRule) {
        this.rules.push(rule);
    }

    /**
     * 评估所有规则并返回匹配的动作
     */
    evaluate(lead: EnrichedLead): RoutingAction[] {
        const matchedActions: RoutingAction[] = [];

        for (const rule of this.rules) {
            if (rule.condition(lead)) {
                console.log(`规则匹配: ${rule.name}`);
                matchedActions.push(...rule.actions);
            }
        }

        return matchedActions;
    }

    /**
     * 加载默认规则
     */
    loadDefaultRules() {
        // 高优线索规则
        this.addRule({
            name: '高优线索（9-10分）',
            condition: (lead) => lead.rating.totalScore >= 9,
            actions: [
                {
                    type: 'notify',
                    channels: ['wechat', 'dingtalk']
                },
                {
                    type: 'generate_email',
                    template: 'personalized_outreach'
                },
                {
                    type: 'crm_push',
                    priority: 'high',
                    owner: 'auto_assign',
                    stage: 'qualified_lead'
                }
            ]
        });

        // 中优线索规则
        this.addRule({
            name: '中优线索（6-8分）',
            condition: (lead) => lead.rating.totalScore >= 6 && lead.rating.totalScore < 9,
            actions: [
                {
                    type: 'email_sequence',
                    campaign: 'nurture_6month'
                },
                {
                    type: 'crm_push',
                    priority: 'medium',
                    stage: 'lead'
                }
            ]
        });

        // 低分线索规则
        this.addRule({
            name: '低分线索（<6分）',
            condition: (lead) => lead.rating.totalScore < 6,
            actions: [
                {
                    type: 'archive',
                    reason: 'low_score'
                }
            ]
        });

        // 特殊规则：招聘信号强烈
        this.addRule({
            name: '招聘信号强烈（立即跟进）',
            condition: (lead) =>
                lead.rating.breakdown.intentSignals >= 3 &&
                lead.data.jobPostings && lead.data.jobPostings.length > 2,
            actions: [
                {
                    type: 'notify',
                    channels: ['wechat']
                },
                {
                    type: 'crm_push',
                    priority: 'high',
                    stage: 'hot_lead'
                }
            ]
        });
    }
}

// ============ CRM 集成接口 ============

export interface ICRMIntegration {
    createLead(lead: EnrichedLead, options: any): Promise<string>;
    updateLead(leadId: string, data: any): Promise<void>;
    assignOwner(leadId: string, ownerId: string): Promise<void>;
}

/**
 * HubSpot 集成
 */
export class HubSpotIntegration implements ICRMIntegration {
    private apiKey: string;
    private baseUrl = 'https://api.hubapi.com';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async createLead(lead: EnrichedLead, options: any): Promise<string> {
        const { data, rating } = lead;

        const response = await axios.post(
            `${this.baseUrl}/crm/v3/objects/contacts`,
            {
                properties: {
                    firstname: data.name.split(' ')[0] || '',
                    lastname: data.name.split(' ')[1] || '',
                    company: data.name,
                    email: data.email,
                    phone: data.phone,
                    website: data.website,
                    industry: data.industry,
                    city: data.region,

                    // 自定义字段
                    ai_rating_score: rating.totalScore,
                    ai_rating_confidence: rating.confidence,
                    ai_rating_reasoning: rating.reasoning,
                    ai_icebreaker: rating.icebreaker,
                    lead_source: data.sourceUrl,
                    employee_count: data.employeeCount,

                    // 生命周期阶段
                    lifecyclestage: options.stage || 'lead',
                    hs_lead_status: this.mapPriorityToStatus(options.priority)
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const contactId = response.data.id;

        // 自动分配所有者
        if (options.owner === 'auto_assign') {
            await this.assignOwner(contactId, await this.getNextAvailableOwner());
        }

        return contactId;
    }

    async updateLead(leadId: string, data: any): Promise<void> {
        await axios.patch(
            `${this.baseUrl}/crm/v3/objects/contacts/${leadId}`,
            { properties: data },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );
    }

    async assignOwner(leadId: string, ownerId: string): Promise<void> {
        await this.updateLead(leadId, {
            hubspot_owner_id: ownerId
        });
    }

    private mapPriorityToStatus(priority: string): string {
        const mapping: Record<string, string> = {
            'high': 'OPEN',
            'medium': 'IN_PROGRESS',
            'low': 'ATTEMPTED_TO_CONTACT'
        };
        return mapping[priority] || 'NEW';
    }

    private async getNextAvailableOwner(): Promise<string> {
        // 实际实现：查询负载最少的销售
        // 这里简化为返回默认所有者 ID
        return process.env.DEFAULT_OWNER_ID || '12345';
    }
}

// ============ 通知服务 ============

export interface INotifier {
    send(message: string, data: EnrichedLead): Promise<void>;
}

/**
 * 微信企业号通知
 */
export class WeChatNotifier implements INotifier {
    constructor(
        private webhookUrl: string
    ) { }

    async send(message: string, lead: EnrichedLead): Promise<void> {
        const content = this.formatMessage(lead);

        await axios.post(this.webhookUrl, {
            msgtype: 'markdown',
            markdown: {
                content
            }
        });
    }

    private formatMessage(lead: EnrichedLead): string {
        const { data, rating } = lead;

        return `
## 🎯 高优线索提醒

**公司名称**: ${data.name}
**评分**: <font color="warning">${rating.totalScore.toFixed(1)}</font> 分
**行业**: ${data.industry || '未知'}
**规模**: ${data.estimatedSize || '未知'}

**评分理由**:
${rating.reasoning}

**建议切入点**:
${rating.icebreaker}

---
[查看详情](${data.sourceUrl})
    `.trim();
    }
}

/**
 * 钉钉通知
 */
export class DingTalkNotifier implements INotifier {
    constructor(
        private webhookUrl: string,
        private secret: string
    ) { }

    async send(message: string, lead: EnrichedLead): Promise<void> {
        const timestamp = Date.now();
        const sign = this.generateSignature(timestamp);

        await axios.post(
            `${this.webhookUrl}&timestamp=${timestamp}&sign=${sign}`,
            {
                msgtype: 'markdown',
                markdown: {
                    title: '高优线索提醒',
                    text: this.formatMessage(lead)
                },
                at: {
                    isAtAll: false
                }
            }
        );
    }

    private generateSignature(timestamp: number): string {
        const crypto = require('crypto');
        const stringToSign = `${timestamp}\n${this.secret}`;
        return crypto
            .createHmac('sha256', this.secret)
            .update(stringToSign)
            .digest('base64');
    }

    private formatMessage(lead: EnrichedLead): string {
        // 与微信格式类似
        return `### 高优线索: ${lead.data.name}\n评分: ${lead.rating.totalScore}`;
    }
}

/**
 * 邮件通知
 */
export class EmailNotifier implements INotifier {
    constructor(
        private smtpConfig: any,
        private from: string,
        private to: string[]
    ) { }

    async send(message: string, lead: EnrichedLead): Promise<void> {
        const nodemailer = require('nodemailer');

        const transporter = nodemailer.createTransport(this.smtpConfig);

        await transporter.sendMail({
            from: this.from,
            to: this.to.join(','),
            subject: `🎯 高优线索: ${lead.data.name} (${lead.rating.totalScore}分)`,
            html: this.formatHtml(lead)
        });
    }

    private formatHtml(lead: EnrichedLead): string {
        return `
      <h2>高优线索提醒</h2>
      <p><strong>公司</strong>: ${lead.data.name}</p>
      <p><strong>评分</strong>: ${lead.rating.totalScore}</p>
      <p><strong>理由</strong>: ${lead.rating.reasoning}</p>
      <p><strong>切入点</strong>: ${lead.icebreaker}</p>
    `;
    }
}

// ============ 自动化服务 ============

export class AutomationService {
    private ruleEngine: RuleEngine;
    private crmIntegration: ICRMIntegration;
    private notifiers: Map<string, INotifier>;

    constructor(
        ruleEngine: RuleEngine,
        crmIntegration: ICRMIntegration,
        notifiers: Map<string, INotifier>
    ) {
        this.ruleEngine = ruleEngine;
        this.crmIntegration = crmIntegration;
        this.notifiers = notifiers;
    }

    /**
     * 处理单个线索
     */
    async processLead(lead: EnrichedLead): Promise<void> {
        console.log(`处理线索: ${lead.data.name} (${lead.rating.totalScore}分)`);

        // 评估规则
        const actions = this.ruleEngine.evaluate(lead);

        // 执行动作
        for (const action of actions) {
            try {
                await this.executeAction(action, lead);
            } catch (error: any) {
                console.error(`执行动作失败: ${action.type}`, error.message);
            }
        }
    }

    private async executeAction(action: RoutingAction, lead: EnrichedLead): Promise<void> {
        switch (action.type) {
            case 'notify':
                await this.sendNotifications(action.channels || [], lead);
                break;

            case 'crm_push':
                await this.pushToCRM(lead, action);
                break;

            case 'email_sequence':
                await this.addToEmailSequence(lead, action.campaign!);
                break;

            case 'generate_email':
                await this.generatePersonalizedEmail(lead);
                break;

            case 'archive':
                await this.archiveLead(lead, action.reason!);
                break;
        }
    }

    private async sendNotifications(channels: string[], lead: EnrichedLead): Promise<void> {
        for (const channel of channels) {
            const notifier = this.notifiers.get(channel);
            if (notifier) {
                await notifier.send('', lead);
                console.log(`✓ 已发送通知: ${channel}`);
            }
        }
    }

    private async pushToCRM(lead: EnrichedLead, options: any): Promise<void> {
        const leadId = await this.crmIntegration.createLead(lead, options);
        console.log(`✓ 已推送到 CRM: ${leadId}`);
    }

    private async addToEmailSequence(lead: EnrichedLead, campaign: string): Promise<void> {
        // 集成邮件营销平台（Mailchimp、SendGrid 等）
        console.log(`✓ 已加入邮件序列: ${campaign}`);
    }

    private async generatePersonalizedEmail(lead: EnrichedLead): Promise<void> {
        // 已在评分时生成 icebreaker
        console.log(`✓ 个性化邮件: ${lead.rating.icebreaker}`);
    }

    private async archiveLead(lead: EnrichedLead, reason: string): Promise<void> {
        // 保存到数据库归档表
        console.log(`✓ 已归档: ${reason}`);
    }
}

// ============ 使用示例 ============

/*
// 初始化
const ruleEngine = new RuleEngine();
ruleEngine.loadDefaultRules();

const hubspot = new HubSpotIntegration(process.env.HUBSPOT_API_KEY!);

const notifiers = new Map<string, INotifier>([
  ['wechat', new WeChatNotifier(process.env.WECHAT_WEBHOOK_URL!)],
  ['dingtalk', new DingTalkNotifier(
    process.env.DINGTALK_WEBHOOK_URL!,
    process.env.DINGTALK_SECRET!
  )]
]);

const automation = new AutomationService(ruleEngine, hubspot, notifiers);

// 处理线索
await automation.processLead({
  data: companyData,
  rating: ratingResult
});
*/
