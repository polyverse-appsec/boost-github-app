import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Optional: Import types for better type checking and autocompletion
import { SendEmailRequest, SendEmailResponse } from "@aws-sdk/client-ses";
import { AnyLengthString } from "aws-sdk/clients/comprehend";

const monitoringEmail : string = process.env.MONITORING_EMAIL || "monitoring@polyverse.com";

export async function sendMonitoringEmail(subject: string, body: string) {
	await sendEmail(`[Boost Monitoring] ${subject}`, body, monitoringEmail);
}

export async function sendEmail(
	subject: string,
	body: string,
	recipientEmail: string,
	senderEmail: string = monitoringEmail
	): Promise<void>  {
	if (recipientEmail === "") {
		console.log(`SIMULATING SES EMAIL (blank recipient): ${subject}`);
		return;
	}

	const client = new SESClient({ region: "us-west-2" });

	const params: SendEmailRequest = {
		Source: senderEmail,
		Destination: {
			ToAddresses: [recipientEmail],
		},
		Message: {
			Body: {
				Text: {
					Charset: "UTF-8",
					Data: body,
				},
			},
			Subject: {
				Charset: "UTF-8",
				Data: subject,
			},
		},
	};

    if (!process.env.EMAIL_NOTIFICATIONS) {
        console.log(`Boost Service Send Email (disabled) from ${senderEmail} to ${recipientEmail}: ${subject} ${body}`);
        return;
    }

    try {
		const command = new SendEmailCommand(params);
		const response: SendEmailResponse = await client.send(command);
		console.log(
			`SES Email (id:${response.MessageId}) sent to ${recipientEmail}: ${subject}`
			);
	} catch (error: any) {
		console.error(
			`Boost Service Send Email failed from ${senderEmail} to ${recipientEmail}: ${subject} ${body}`,
			error.stack || error);
	}
};
		