pipeline {
    agent any

    environment {
        DOCKER_HUB_USERNAME = 'devharep7'
        IMAGE_NAME          = 'devops-assignment'
        IMAGE_TAG           = "${BUILD_NUMBER}"
        IMAGE_FULL          = "${DOCKER_HUB_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}"
        IMAGE_LATEST        = "${DOCKER_HUB_USERNAME}/${IMAGE_NAME}:latest"
        CONTAINER_NAME      = 'devops-assignment-container'
        APP_PORT            = '3000'
        HOST_PORT           = '80'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
        timestamps()
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
                sh 'git log -1 --format="Commit: %H | Author: %an"'
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'node --version'
                sh 'npm  --version'
                sh 'npm ci'
            }
        }

        stage('Run Tests') {
            steps {
                sh 'npm test'
            }
            post {
                always {
                    publishHTML([
                        allowMissing:          true,
                        alwaysLinkToLastBuild: true,
                        keepAll:               true,
                        reportDir:             'coverage/lcov-report',
                        reportFiles:           'index.html',
                        reportName:            'Test Coverage Report'
                    ])
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh """
                    docker build \\
                        --build-arg BUILD_DATE=\$(date -u +%Y-%m-%dT%H:%M:%SZ) \\
                        --build-arg GIT_COMMIT=\$(git rev-parse --short HEAD) \\
                        --build-arg VERSION=${IMAGE_TAG} \\
                        --label "build.number=${BUILD_NUMBER}" \\
                        --label "git.commit=\$(git rev-parse --short HEAD)" \\
                        -t ${IMAGE_FULL} \\
                        .
                """
            }
        }

        stage('Tag Image') {
            steps {
                sh "docker tag ${IMAGE_FULL} ${IMAGE_LATEST}"
                sh "docker images | grep ${IMAGE_NAME}"
            }
        }

        stage('Push Docker Image') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'docker-hub-creds',
                    usernameVariable: 'DOCKER_USER',
                    passwordVariable: 'DOCKER_PASS'
                )]) {
                    sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'
                    sh "docker push ${IMAGE_FULL}"
                    sh "docker push ${IMAGE_LATEST}"
                }
            }
        }

        stage('Deploy on EC2') {
            steps {
                sshagent(credentials: ['ssh-ec2']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no \\
                            ${DEVOPS_EC2_USER}@${DEVOPS_EC2_HOST} '
                            docker stop ${CONTAINER_NAME} 2>/dev/null || true
                            docker rm   ${CONTAINER_NAME} 2>/dev/null || true
                            docker pull ${IMAGE_FULL}
                            docker run -d \\
                                --name ${CONTAINER_NAME} \\
                                --restart unless-stopped \\
                                -p ${HOST_PORT}:${APP_PORT} \\
                                -e NODE_ENV=production \\
                                ${IMAGE_FULL}
                            docker ps | grep ${CONTAINER_NAME}
                        '
                    """
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                sshagent(credentials: ['ssh-ec2']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no \\
                            ${DEVOPS_EC2_USER}@${DEVOPS_EC2_HOST} '
                            sleep 10
                            curl --fail --silent --max-time 10 \\
                                http://localhost:${HOST_PORT}/health
                            echo ""
                            curl --silent http://localhost:${HOST_PORT}/
                            echo ""
                            docker ps
                        '
                    """
                }
            }
        }

        stage('Cleanup') {
            steps {
                sh "docker rmi ${IMAGE_FULL}   || true"
                sh "docker rmi ${IMAGE_LATEST} || true"
                sh "docker image prune -f"
            }
        }

    }

    post {
        success {
            emailext(
                subject: "BUILD SUCCESS - devops-assignment #${BUILD_NUMBER}",
                body: """
                    <h3>Build Succeeded</h3>
                    <p><b>Job:</b> ${JOB_NAME} #${BUILD_NUMBER}</p>
                    <p><b>Image:</b> ${IMAGE_FULL}</p>
                    <p><b>Live URL:</b> http://${DEVOPS_EC2_HOST}/</p>
                    <p><b>Health:</b> http://${DEVOPS_EC2_HOST}/health</p>
                    <p><a href="${BUILD_URL}">View Build</a></p>
                """,
                mimeType: 'text/html',
                to: "${DEVOPS_EMAIL_RECIPIENTS}"
            )
        }
        failure {
            sshagent(credentials: ['ssh-ec2']) {
                sh """
                    ssh -o StrictHostKeyChecking=no \\
                        ${DEVOPS_EC2_USER}@${DEVOPS_EC2_HOST} '
                        PREV_TAG=\$((${BUILD_NUMBER} - 1))
                        docker stop ${CONTAINER_NAME} 2>/dev/null || true
                        docker rm   ${CONTAINER_NAME} 2>/dev/null || true
                        docker run -d \\
                            --name ${CONTAINER_NAME} \\
                            --restart unless-stopped \\
                            -p ${HOST_PORT}:${APP_PORT} \\
                            -e NODE_ENV=production \\
                            ${DOCKER_HUB_USERNAME}/${IMAGE_NAME}:\${PREV_TAG} || true
                    ' || true
                """
            }
            emailext(
                subject: "BUILD FAILED - devops-assignment #${BUILD_NUMBER}",
                body: """
                    <h3>Build Failed</h3>
                    <p><b>Job:</b> ${JOB_NAME} #${BUILD_NUMBER}</p>
                    <p><b>Branch:</b> ${GIT_BRANCH}</p>
                    <p>Rollback to build #\$((${BUILD_NUMBER} - 1)) was attempted.</p>
                    <p><a href="${BUILD_URL}console">View Console Output</a></p>
                """,
                mimeType: 'text/html',
                to: "${DEVOPS_EMAIL_RECIPIENTS}"
            )
        }
        always {
            sh 'docker logout || true'
            cleanWs()
        }
    }
}
